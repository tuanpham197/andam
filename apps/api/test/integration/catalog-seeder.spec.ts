import { seedCatalog } from '../../src/modules/catalog/adapters/out/persistence/catalog-seeder.js';
import type { CatalogInput } from '../../src/modules/catalog/domain/catalog-validation.js';
import { createTestPrisma, resetDatabase } from '../support/database.js';

const prisma = createTestPrisma();
beforeEach(() => resetDatabase(prisma));
afterAll(() => prisma.onModuleDestroy());

function sample(version = 1, name = 'Cháo cá hồi'): CatalogInput {
  return {
    stages: [
      {
        id: 2,
        name: 'Giai đoạn 2',
        ageFromMonths: 8,
        ageToMonths: 10,
        texture: 'lumpy',
        portionText: 'Khoảng 125 ml',
        mainMeals: 3,
        snacksMin: 1,
        snacksMax: 1,
        defaultSchedule: [{ slot: 'lunch', time: '11:00' }],
      },
    ],
    ingredients: [
      {
        id: 'ing_gao',
        name: 'Gạo tẻ',
        aliases: ['gạo'],
        foodGroup: 'carb',
        allergenTags: [],
        minAgeMonths: 6,
      },
      {
        id: 'ing_ca_hoi',
        name: 'Cá hồi',
        aliases: ['Salmon'],
        foodGroup: 'protein',
        proteinSource: 'fish',
        allergenTags: ['fish'],
        minAgeMonths: 6,
      },
    ],
    dishes: [
      {
        id: 'dish_chao',
        name,
        description: 'd',
        mealType: 'main',
        prepMin: 10,
        cookMin: 15,
        tool: 'Nồi',
        mainProtein: 'fish',
        stages: [2],
        variants: [{ stage: 2, texture: 'lumpy', portionText: '120–150 ml', portionMl: 135 }],
        ingredients:
          version === 1
            ? [
                { ingredientId: 'ing_gao', qty: 20, unit: 'g', isMain: false },
                { ingredientId: 'ing_ca_hoi', qty: 25, unit: 'g', isMain: true },
              ]
            : [{ ingredientId: 'ing_ca_hoi', qty: 30, unit: 'g', isMain: true }],
        steps: ['a'],
        safetyNotes: ['x'],
        contentVersion: version,
        status: 'published',
      },
    ],
  };
}

describe('seedCatalog (TC-DB-002)', () => {
  it('loads stages, ingredients with accent-free search text, dishes with their lines', async () => {
    await seedCatalog(prisma, sample());
    expect(await prisma.stage.count()).toBe(1);
    expect(await prisma.ingredient.findUnique({ where: { id: 'ing_ca_hoi' } })).toMatchObject({
      searchText: 'ca hoi salmon',
      allergenTags: ['fish'],
      proteinSource: 'fish',
    });
    const dish = await prisma.dish.findUnique({
      where: { id: 'dish_chao' },
      include: { ingredients: true, variants: true },
    });
    expect(dish).toMatchObject({ searchText: 'chao ca hoi', contentVersion: 1 });
    expect(dish!.ingredients).toHaveLength(2);
    expect(dish!.variants).toEqual([expect.objectContaining({ stageId: 2, portionMl: 135 })]);
  });

  it('is idempotent: running twice creates nothing twice', async () => {
    await seedCatalog(prisma, sample());
    await seedCatalog(prisma, sample());
    expect(await prisma.ingredient.count()).toBe(2);
    expect(await prisma.dish.count()).toBe(1);
    expect(await prisma.dishIngredient.count()).toBe(2);
  });

  it('replaces a dish when its content version increases', async () => {
    await seedCatalog(prisma, sample(1));
    await seedCatalog(prisma, sample(2, 'Cháo cá hồi (mới)'));
    const dish = await prisma.dish.findUnique({
      where: { id: 'dish_chao' },
      include: { ingredients: true },
    });
    expect(dish).toMatchObject({ name: 'Cháo cá hồi (mới)', contentVersion: 2 });
    expect(dish!.ingredients).toEqual([expect.objectContaining({ ingredientId: 'ing_ca_hoi' })]);
  });

  it('never downgrades a dish to an older content version', async () => {
    await seedCatalog(prisma, sample(2, 'v2'));
    await seedCatalog(prisma, sample(1, 'v1'));
    expect(await prisma.dish.findUnique({ where: { id: 'dish_chao' } })).toMatchObject({
      name: 'v2',
      contentVersion: 2,
    });
  });

  it('seeds the real repository catalog', async () => {
    const { loadCatalog, REPO_CATALOG_DIR } =
      await import('../../src/modules/catalog/adapters/out/files/catalog-files.js');
    await seedCatalog(prisma, await loadCatalog(REPO_CATALOG_DIR));
    expect(await prisma.stage.count()).toBe(4);
    expect(await prisma.dish.count()).toBeGreaterThanOrEqual(12);
  });
});
