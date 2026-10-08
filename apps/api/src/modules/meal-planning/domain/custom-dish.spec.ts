import { catalogFixture } from '../../../../test/fakes/meal-planning-fixtures.js';
import {
  CUSTOM_DISH_LIMIT,
  buildCustomDish,
  customPlanDish,
  unsafeIngredients,
  type CustomDishInput,
} from './custom-dish.js';
import {
  CustomDishLimitError,
  CustomDishNotSafeError,
  DishNameTakenError,
  InvalidCustomDishError,
  UnknownDishIngredientError,
} from './errors.js';
import type { PlanIngredient } from './model.js';

const ingredients = (() => {
  const map = new Map(catalogFixture().ingredients);
  map.set('ing_mat_ong', {
    id: 'ing_mat_ong',
    name: 'Mật ong',
    foodGroup: 'seasoning',
    proteinSource: null,
    allergenTags: [],
    minAgeMonths: 12,
  });
  return map as ReadonlyMap<string, PlanIngredient>;
})();

const input = (overrides: Partial<CustomDishInput> = {}): CustomDishInput => ({
  name: 'Cháo gà bí đỏ nhà làm',
  mealType: 'main',
  ingredients: [{ id: 'ing_gao' }, { id: 'ing_ga' }, { id: 'ing_bi' }],
  prepMin: 10,
  cookMin: 20,
  steps: ['Vo gạo', 'Nấu cháo'],
  ...overrides,
});

const invalidField = (overrides: Partial<CustomDishInput>) => {
  try {
    buildCustomDish(input(overrides), ingredients);
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidCustomDishError);
    return (error as InvalidCustomDishError).field;
  }
  throw new Error('expected the dish to be refused');
};

describe('buildCustomDish (BR-81, BR-84, BR-87)', () => {
  it('TC-CUS-001 derives the main food, protein and accent-free name key; no quantity needed', () => {
    expect(buildCustomDish(input(), ingredients)).toEqual({
      name: 'Cháo gà bí đỏ nhà làm',
      nameKey: 'chao ga bi do nha lam',
      mealType: 'main',
      lines: [
        { ingredientId: 'ing_gao', qty: null, unit: null, isMain: false },
        { ingredientId: 'ing_ga', qty: null, unit: null, isMain: true },
        { ingredientId: 'ing_bi', qty: null, unit: null, isMain: false },
      ],
      mainProtein: 'chicken',
      prepMin: 10,
      cookMin: 20,
      steps: ['Vo gạo', 'Nấu cháo'],
    });
  });

  it('BR-84 without protein the vegetables and fruit lead; with neither, every food does', () => {
    const veg = buildCustomDish(
      input({ ingredients: [{ id: 'ing_gao' }, { id: 'ing_bi' }, { id: 'ing_chuoi' }] }),
      ingredients,
    );
    expect(veg.lines.filter((l) => l.isMain).map((l) => l.ingredientId)).toEqual([
      'ing_bi',
      'ing_chuoi',
    ]);
    expect(veg.mainProtein).toBeNull();
    const staples = buildCustomDish(
      input({ ingredients: [{ id: 'ing_gao' }, { id: 'ing_dau_an' }] }),
      ingredients,
    );
    expect(staples.lines.every((l) => l.isMain)).toBe(true);
  });

  it('takes the protein source of the first protein listed', () => {
    const dish = buildCustomDish(
      input({ ingredients: [{ id: 'ing_bo' }, { id: 'ing_ga' }] }),
      ingredients,
    );
    expect(dish.mainProtein).toBe('beef');
  });

  it('TC-CUS-003 normalises the name to NFC and trims it; 2 and 60 characters are fine', () => {
    expect(buildCustomDish(input({ name: '  Cháo  ' }), ingredients).name).toBe('Cháo');
    expect(buildCustomDish(input({ name: 'Ab' }), ingredients).name).toBe('Ab');
    expect(buildCustomDish(input({ name: '🍲'.repeat(60) }), ingredients).name).toHaveLength(120);
  });

  it.each([['A'], ['   '], ['x'.repeat(61)]])('TC-CUS-003 refuses the name %j', (name) => {
    expect(invalidField({ name })).toBe('name');
  });

  it('TC-CUS-005 keeps each food once and accepts 15 foods', () => {
    const dish = buildCustomDish(
      input({ ingredients: [{ id: 'ing_ga' }, { id: 'ing_ga', qty: 50 }, { id: 'ing_bi' }] }),
      ingredients,
    );
    expect(dish.lines.map((l) => l.ingredientId)).toEqual(['ing_ga', 'ing_bi']);
    const fifteen = [...ingredients.keys()].slice(0, 15).map((id) => ({ id }));
    expect(buildCustomDish(input({ ingredients: fifteen }), ingredients).lines).toHaveLength(15);
  });

  it('TC-CUS-005 refuses no food and 16 foods', () => {
    expect(invalidField({ ingredients: [] })).toBe('ingredients');
    const sixteen = [...ingredients.keys()].slice(0, 16).map((id) => ({ id }));
    expect(sixteen).toHaveLength(16);
    expect(invalidField({ ingredients: sixteen })).toBe('ingredients');
  });

  it('TC-CUS-005 names the foods missing from the catalog', () => {
    expect(() =>
      buildCustomDish(input({ ingredients: [{ id: 'ing_ga' }, { id: 'ing_pizza' }] }), ingredients),
    ).toThrow(new UnknownDishIngredientError(['ing_pizza']));
    expect(new UnknownDishIngredientError(['x']).ingredientIds).toEqual(['x']);
  });

  it('TC-CUS-006 keeps a quantity in (0, 9999] and a unit of up to 12 characters', () => {
    const dish = buildCustomDish(
      input({
        ingredients: [
          { id: 'ing_ga', qty: 0.5, unit: ' thìa canh ' },
          { id: 'ing_bi', qty: 9999, unit: 'x'.repeat(12) },
          { id: 'ing_gao', qty: null, unit: '  ' },
        ],
      }),
      ingredients,
    );
    expect(dish.lines.map((l) => [l.qty, l.unit])).toEqual([
      [0.5, 'thìa canh'],
      [9999, 'x'.repeat(12)],
      [null, null],
    ]);
  });

  it.each([0, -1, 10000, Number.NaN, Number.POSITIVE_INFINITY])(
    'TC-CUS-006 refuses the quantity %s',
    (qty) => {
      expect(invalidField({ ingredients: [{ id: 'ing_ga', qty }] })).toBe('qty');
    },
  );

  it('TC-CUS-006 refuses a 13-character unit', () => {
    expect(invalidField({ ingredients: [{ id: 'ing_ga', unit: 'x'.repeat(13) }] })).toBe('unit');
  });

  it('TC-CUS-007 accepts the time limits and drops empty steps', () => {
    const dish = buildCustomDish(
      input({ prepMin: 180, cookMin: 240, steps: ['  ', 'Hấp', ''] }),
      ingredients,
    );
    expect(dish).toMatchObject({ prepMin: 180, cookMin: 240, steps: ['Hấp'] });
    expect(buildCustomDish(input({ prepMin: 0, cookMin: 1 }), ingredients).cookMin).toBe(1);
    expect(buildCustomDish(input({ steps: Array(15).fill('b') }), ingredients).steps).toHaveLength(
      15,
    );
    expect(buildCustomDish(input({ steps: ['x'.repeat(300)] }), ingredients).steps).toHaveLength(1);
  });

  it.each<[Partial<CustomDishInput>, string]>([
    [{ prepMin: 181 }, 'prepMin'],
    [{ prepMin: -1 }, 'prepMin'],
    [{ prepMin: 2.5 }, 'prepMin'],
    [{ cookMin: 241 }, 'cookMin'],
    [{ prepMin: 0, cookMin: 0 }, 'cookMin'],
    [{ steps: Array(16).fill('b') }, 'steps'],
    [{ steps: ['x'.repeat(301)] }, 'steps'],
  ])('TC-CUS-007 refuses %j', (overrides, field) => {
    expect(invalidField(overrides)).toBe(field);
  });
});

describe('unsafeIngredients (BR-82)', () => {
  const ctx = {
    ingredients,
    ageMonths: 8,
    avoidAllergens: new Set(['egg'] as const),
    avoidIngredients: new Set(['ing_bo']),
    paused: new Set(['ing_bi']),
  };

  it('TC-CUS-002 names each unsafe food with the first rule it breaks', () => {
    expect(
      unsafeIngredients(['ing_gao', 'ing_trung', 'ing_bo', 'ing_bi', 'ing_mat_ong'], ctx),
    ).toEqual([
      { id: 'ing_trung', reason: 'allergen' },
      { id: 'ing_bo', reason: 'avoid' },
      { id: 'ing_bi', reason: 'paused' },
      { id: 'ing_mat_ong', reason: 'age' },
    ]);
  });

  it('finds nothing in a safe dish; honey is fine from 12 months', () => {
    expect(unsafeIngredients(['ing_gao', 'ing_ga'], ctx)).toEqual([]);
    expect(unsafeIngredients(['ing_mat_ong'], { ...ctx, ageMonths: 12 })).toEqual([]);
  });
});

describe('custom dish errors', () => {
  it('carry what the form needs', () => {
    expect(new CustomDishNotSafeError([{ id: 'a', name: 'A', reason: 'age' }]).ingredients).toEqual(
      [{ id: 'a', name: 'A', reason: 'age' }],
    );
    expect(new CustomDishNotSafeError([{ id: 'a', name: 'A', reason: 'age' }]).details).toEqual({
      ingredients: [{ id: 'a', name: 'A', reason: 'age' }],
    });
    expect(new InvalidCustomDishError('name').details).toEqual({ field: 'name' });
    expect(new UnknownDishIngredientError(['x']).details).toEqual({ ingredientIds: ['x'] });
    expect(new DishNameTakenError().code).toBe('DISH_NAME_TAKEN');
    expect(new CustomDishLimitError().code).toBe('CUSTOM_DISH_LIMIT_REACHED');
    expect(CUSTOM_DISH_LIMIT).toBe(50);
  });
});

describe('customPlanDish (BR-83, BR-85)', () => {
  const stages = [
    { stage: 1 as const, texture: 'puree_smooth' as const, portionText: '2–3 thìa' },
    { stage: 2 as const, texture: 'lumpy' as const, portionText: 'Khoảng 125 ml' },
  ];
  const stored = {
    ...buildCustomDish(input(), ingredients),
    id: 'custom_1',
    childId: 'c-1',
    archivedAt: null,
  };

  it('is offered at every stage with the stage texture and main-meal portion', () => {
    expect(customPlanDish(stored, stages)).toEqual({
      id: 'custom_1',
      name: 'Cháo gà bí đỏ nhà làm',
      mealType: 'main',
      prepMin: 10,
      cookMin: 20,
      mainProtein: 'chicken',
      stages: [1, 2],
      variants: [
        { stage: 1, texture: 'puree_smooth', portionText: '2–3 thìa' },
        { stage: 2, texture: 'lumpy', portionText: 'Khoảng 125 ml' },
      ],
      ingredientIds: ['ing_gao', 'ing_ga', 'ing_bi'],
      mainIngredientIds: ['ing_ga'],
      custom: true,
      archived: false,
    });
  });

  it('gives a snack the snack portions, and marks a deleted dish archived', () => {
    const snack = customPlanDish({ ...stored, mealType: 'snack', archivedAt: new Date() }, stages);
    expect(snack.variants.map((v) => v.portionText)).toEqual(['1–2 thìa', '60–80 ml']);
    expect(snack.archived).toBe(true);
  });
});
