import { PrismaCatalogReader } from '../../src/modules/catalog/adapters/out/persistence/prisma-catalog.reader.js';
import {
  REPO_CATALOG_DIR,
  loadCatalog,
} from '../../src/modules/catalog/adapters/out/files/catalog-files.js';
import { seedCatalog } from '../../src/modules/catalog/adapters/out/persistence/catalog-seeder.js';
import { toSearchText } from '../../src/shared/kernel/search-text.js';
import { createTestPrisma, resetDatabase } from '../support/database.js';

const prisma = createTestPrisma();
const reader = new PrismaCatalogReader(prisma);
const search = (q: string, limit = 20) => reader.searchIngredients(toSearchText(q), limit);
const names = async (q: string, limit?: number) => (await search(q, limit)).map((i) => i.name);

beforeAll(async () => {
  await resetDatabase(prisma);
  await seedCatalog(prisma, await loadCatalog(REPO_CATALOG_DIR));
});
afterAll(() => prisma.onModuleDestroy());

describe('PrismaCatalogReader.listStages', () => {
  it('returns the 4 stages in order', async () => {
    const stages = await reader.listStages();
    expect(stages.map((s) => s.id)).toEqual([1, 2, 3, 4]);
    expect(stages[1]).toEqual({
      id: 2,
      name: 'Giai đoạn 2',
      ageFromMonths: 8,
      ageToMonths: 10,
      texture: 'lumpy',
      portionText: 'Khoảng 125 ml',
      mainMeals: 3,
      snacksMin: 1,
      snacksMax: 1,
    });
  });
});

describe('PrismaCatalogReader planning data', () => {
  it('lists every dish with its stages, variants and ingredient ids', async () => {
    const dishes = await reader.listDishes();
    expect(dishes.length).toBeGreaterThanOrEqual(12);
    const salmon = dishes.find((d) => d.id === 'dish_chao_ca_hoi_rau_ngot')!;
    expect(salmon).toEqual({
      id: 'dish_chao_ca_hoi_rau_ngot',
      name: 'Cháo cá hồi rau ngót',
      mealType: 'main',
      prepMin: 10,
      cookMin: 15,
      mainProtein: 'fish',
      stages: [1, 2, 3],
      variants: [
        { stage: 1, texture: 'puree_smooth', portionText: '2–3 thìa, tăng dần', portionMl: null },
        { stage: 2, texture: 'lumpy', portionText: '120–150 ml tham khảo', portionMl: 135 },
        { stage: 3, texture: 'minced_soft', portionText: 'Khoảng 125 ml', portionMl: 125 },
      ],
      ingredientIds: expect.arrayContaining([
        'ing_gao_te',
        'ing_ca_hoi',
        'ing_rau_ngot',
        'ing_dau_an_dam',
      ]),
      mainIngredientIds: ['ing_ca_hoi'],
    });
  });

  it('lists every ingredient with group, protein, allergens and minimum age', async () => {
    const ingredients = await reader.listIngredients();
    expect(ingredients.find((i) => i.id === 'ing_mat_ong')).toEqual({
      id: 'ing_mat_ong',
      name: 'Mật ong',
      foodGroup: 'seasoning',
      proteinSource: null,
      allergenTags: [],
      minAgeMonths: 12,
    });
  });

  it('gives the meal schedule of a stage', async () => {
    expect(await reader.stageSchedule(2)).toEqual({
      mainMeals: 3,
      snacksMin: 1,
      schedule: [
        { slot: 'breakfast', time: '07:30' },
        { slot: 'lunch', time: '11:00' },
        { slot: 'afternoon_snack', time: '15:00' },
        { slot: 'dinner', time: '18:00' },
      ],
    });
  });

  it('gives a full recipe, or null for an unknown dish', async () => {
    const recipe = await reader.recipe('dish_chao_ca_hoi_rau_ngot');
    expect(recipe).toMatchObject({
      id: 'dish_chao_ca_hoi_rau_ngot',
      description: 'Cháo gạo tẻ nấu nhừ với cá hồi hấp tách xương và rau ngót băm nhỏ.',
      tool: 'Nồi',
      imageUrl: null,
      contentVersion: 1,
      reviewedBy: null,
      steps: expect.arrayContaining(['Hấp chín cá hồi, gỡ xương, dầm nhỏ.']),
      safetyNotes: expect.arrayContaining(['Gỡ và kiểm tra kỹ xương cá trước khi nghiền.']),
    });
    expect(recipe!.lines).toContainEqual({
      ingredientId: 'ing_ca_hoi',
      name: 'Cá hồi',
      qty: 25,
      unit: 'g',
      isMain: true,
      foodGroup: 'protein',
      allergenTags: ['fish'],
    });
    expect(await reader.recipe('dish_khong_co')).toBeNull();
  });
});

describe('PrismaCatalogReader.findIngredientsByIds', () => {
  it('returns the existing ids with their names and skips unknown ones', async () => {
    const found = await reader.findIngredientsByIds(['ing_ca_rot', 'ing_khong_co', 'ing_tom']);
    expect(found.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: 'ing_ca_rot', name: 'Cà rốt' },
      { id: 'ing_tom', name: 'Tôm' },
    ]);
  });

  it('answers an empty list without querying for nothing', async () => {
    expect(await reader.findIngredientsByIds([])).toEqual([]);
  });
});

describe('PrismaCatalogReader.searchIngredients', () => {
  it.each(['ca rot', 'CÀ RỐT', 'cà rốt', 'Cà rốt'.normalize('NFD')])(
    'TC-ING-001 finds Cà rốt for %j',
    async (q) => {
      expect((await names(q))[0]).toBe('Cà rốt');
    },
  );

  it('TC-ING-002 matches đ with d', async () => {
    expect(await names('dau')).toEqual(expect.arrayContaining(['Đậu phụ', 'Đậu Hà Lan']));
  });

  it('matches aliases', async () => {
    expect((await names('salmon'))[0]).toBe('Cá hồi');
    expect((await names('bí ngô'))[0]).toBe('Bí đỏ');
    expect((await names('lạc'))[0]).toBe('Đậu phộng');
  });

  it('ranks names that start with the query first', async () => {
    const result = await names('ca');
    expect(result[0]!.startsWith('Cá') || result[0]!.startsWith('Cà')).toBe(true);
  });

  it('tolerates a small typo', async () => {
    expect(await names('rau ngott')).toContain('Rau ngót');
  });

  it('returns allergen tags and protein source for the avoid-list picker', async () => {
    const [salmon] = await search('cá hồi');
    expect(salmon).toEqual({
      id: 'ing_ca_hoi',
      name: 'Cá hồi',
      foodGroup: 'protein',
      proteinSource: 'fish',
      allergenTags: ['fish'],
    });
    const [carrot] = await search('cà rốt');
    expect(carrot).toMatchObject({ proteinSource: null, allergenTags: [] });
  });

  it('TC-ING-005 respects the limit', async () => {
    expect(await search('a', 3)).toHaveLength(3);
  });

  it('returns nothing for an unknown word', async () => {
    expect(await search('xyzkhongco')).toEqual([]);
  });

  describe('TC-ING-004 treats special characters as text', () => {
    it.each(['%', '_', '\\', "' OR 1=1 --", '"; DROP TABLE ingredients; --'])(
      'does not match everything for %j',
      async (q) => {
        const result = await search(q, 100);
        expect(result.length).toBeLessThan(10);
      },
    );

    it('keeps the table intact', async () => {
      expect(await prisma.ingredient.count()).toBeGreaterThan(40);
    });
  });
});
