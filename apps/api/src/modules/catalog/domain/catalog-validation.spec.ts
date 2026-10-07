import { validateCatalog, type CatalogInput } from './catalog-validation.js';

function catalog(overrides: Partial<CatalogInput> = {}): CatalogInput {
  return {
    stages: [
      {
        id: 1,
        name: 'Giai đoạn 1',
        ageFromMonths: 6,
        ageToMonths: 8,
        texture: 'puree_smooth',
        portionText: '2–3 thìa',
        mainMeals: 2,
        snacksMin: 0,
        snacksMax: 0,
        defaultSchedule: [
          { slot: 'breakfast', time: '08:00' },
          { slot: 'lunch', time: '11:00' },
        ],
      },
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
        defaultSchedule: [{ slot: 'breakfast', time: '07:30' }],
      },
    ],
    ingredients: [
      {
        id: 'ing_gao',
        name: 'Gạo tẻ',
        aliases: [],
        foodGroup: 'carb',
        allergenTags: [],
        minAgeMonths: 6,
      },
      {
        id: 'ing_ca_hoi',
        name: 'Cá hồi',
        aliases: ['salmon'],
        foodGroup: 'protein',
        proteinSource: 'fish',
        allergenTags: ['fish'],
        minAgeMonths: 6,
      },
      {
        id: 'ing_muoi',
        name: 'Muối',
        aliases: [],
        foodGroup: 'fat',
        allergenTags: [],
        minAgeMonths: 12,
      },
    ],
    dishes: [
      {
        id: 'dish_chao_ca_hoi',
        name: 'Cháo cá hồi',
        description: 'Cháo gạo tẻ với cá hồi.',
        mealType: 'main',
        prepMin: 10,
        cookMin: 15,
        tool: 'Nồi',
        mainProtein: 'fish',
        stages: [2],
        variants: [{ stage: 2, texture: 'lumpy', portionText: '120–150 ml', portionMl: 135 }],
        ingredients: [
          { ingredientId: 'ing_gao', qty: 20, unit: 'g', isMain: false },
          { ingredientId: 'ing_ca_hoi', qty: 25, unit: 'g', isMain: true },
        ],
        steps: ['Nấu cháo.', 'Cho cá vào.'],
        safetyNotes: [],
        contentVersion: 1,
        status: 'published',
      },
    ],
    ...overrides,
  };
}

const dish = (patch: Record<string, unknown>) => ({ ...catalog().dishes[0]!, ...patch });

describe('validateCatalog (TC-DB-004)', () => {
  it('accepts a consistent catalog', () => {
    expect(validateCatalog(catalog())).toEqual([]);
  });

  it('reports duplicate ids', () => {
    const c = catalog();
    c.ingredients.push({ ...c.ingredients[0]! });
    expect(validateCatalog(c)).toContain('ingredient ing_gao: id trùng lặp');
  });

  it('reports ingredient ids that do not exist', () => {
    const c = catalog({
      dishes: [
        dish({ ingredients: [{ ingredientId: 'ing_khong_co', qty: 1, unit: 'g', isMain: true }] }),
      ],
    });
    expect(validateCatalog(c)).toContain(
      'dish dish_chao_ca_hoi: nguyên liệu ing_khong_co không tồn tại',
    );
  });

  it('BR-08 forbids an ingredient whose minimum age is above the youngest stage of the dish', () => {
    const c = catalog({
      dishes: [
        dish({
          ingredients: [
            ...catalog().dishes[0]!.ingredients,
            { ingredientId: 'ing_muoi', qty: 1, unit: 'g', isMain: false },
          ],
        }),
      ],
    });
    expect(validateCatalog(c)).toContain(
      'dish dish_chao_ca_hoi: nguyên liệu ing_muoi chỉ dùng từ 12 tháng, món có giai đoạn 2 (từ 8 tháng)',
    );
  });

  it('requires one variant per declared stage and no variant for an undeclared one', () => {
    const c = catalog({
      dishes: [
        dish({ stages: [1, 2], variants: [{ stage: 3, texture: 'lumpy', portionText: 'x' }] }),
      ],
    });
    const problems = validateCatalog(c);
    expect(problems).toContain('dish dish_chao_ca_hoi: thiếu biến thể cho giai đoạn 1');
    expect(problems).toContain('dish dish_chao_ca_hoi: thiếu biến thể cho giai đoạn 2');
    expect(problems).toContain(
      'dish dish_chao_ca_hoi: biến thể cho giai đoạn 3 không được khai báo',
    );
  });

  it('refers stages that exist', () => {
    const c = catalog({
      dishes: [
        dish({ stages: [4], variants: [{ stage: 4, texture: 'family', portionText: 'x' }] }),
      ],
    });
    expect(validateCatalog(c)).toContain('dish dish_chao_ca_hoi: giai đoạn 4 không tồn tại');
  });

  it('checks that a main dish declares a main protein it actually contains', () => {
    const noProtein = catalog({ dishes: [dish({ mainProtein: 'beef' })] });
    expect(validateCatalog(noProtein)).toContain(
      'dish dish_chao_ca_hoi: nguồn đạm chính beef không có trong nguyên liệu',
    );
    const missing = catalog({ dishes: [dish({ mainProtein: undefined })] });
    expect(validateCatalog(missing)).toContain(
      'dish dish_chao_ca_hoi: bữa chính cần nguồn đạm chính',
    );
  });

  it('allows snacks without a protein', () => {
    const c = catalog({ dishes: [dish({ mealType: 'snack', mainProtein: undefined })] });
    expect(validateCatalog(c)).toEqual([]);
  });

  it('rejects a dish without steps or ingredients', () => {
    const c = catalog({ dishes: [dish({ steps: [], ingredients: [] })] });
    const problems = validateCatalog(c);
    expect(problems).toContain('dish dish_chao_ca_hoi: cần ít nhất 1 bước');
    expect(problems).toContain('dish dish_chao_ca_hoi: cần ít nhất 1 nguyên liệu');
  });

  it('reports a malformed file through the schema with the offending path', () => {
    const broken = { ...catalog(), ingredients: [{ id: 'x' }] } as unknown as CatalogInput;
    expect(validateCatalog(broken)[0]).toMatch(/^schema: ingredients\.0\./);
  });

  it('rejects drafts when publishing for production', () => {
    const c = catalog({ dishes: [dish({ status: 'draft' })] });
    expect(validateCatalog(c)).toEqual([]);
    expect(validateCatalog(c, { production: true })).toContain(
      'dish dish_chao_ca_hoi: đang ở trạng thái draft, không được phát hành',
    );
  });
});
