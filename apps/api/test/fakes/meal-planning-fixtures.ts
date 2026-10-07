import type {
  PlanDish,
  PlanIngredient,
  PlanningContext,
} from '../../src/modules/meal-planning/domain/model.js';

/** Small, readable catalog used by the domain specs. */
export function ingredientsFixture(): Map<string, PlanIngredient> {
  const list: PlanIngredient[] = [
    {
      id: 'ing_gao',
      name: 'Gạo tẻ',
      foodGroup: 'carb',
      proteinSource: null,
      allergenTags: [],
      minAgeMonths: 6,
    },
    {
      id: 'ing_dau_an',
      name: 'Dầu ăn dặm',
      foodGroup: 'fat',
      proteinSource: null,
      allergenTags: [],
      minAgeMonths: 6,
    },
    {
      id: 'ing_ca_hoi',
      name: 'Cá hồi',
      foodGroup: 'protein',
      proteinSource: 'fish',
      allergenTags: ['fish'],
      minAgeMonths: 6,
    },
    {
      id: 'ing_rau_ngot',
      name: 'Rau ngót',
      foodGroup: 'veg',
      proteinSource: null,
      allergenTags: [],
      minAgeMonths: 6,
    },
    {
      id: 'ing_dau',
      name: 'Đậu phụ',
      foodGroup: 'protein',
      proteinSource: 'legume',
      allergenTags: ['soy'],
      minAgeMonths: 6,
    },
  ];
  return new Map(list.map((i) => [i.id, i]));
}

export function dishFixture(overrides: Partial<PlanDish> = {}): PlanDish {
  return {
    id: 'dish_chao',
    name: 'Cháo cá hồi rau ngót',
    mealType: 'main',
    prepMin: 10,
    cookMin: 15,
    mainProtein: 'fish',
    stages: [1, 2, 3],
    variants: [
      { stage: 1, texture: 'puree_smooth', portionText: '2–3 thìa' },
      { stage: 2, texture: 'lumpy', portionText: '120–150 ml' },
      { stage: 3, texture: 'minced_soft', portionText: '125 ml' },
    ],
    ingredientIds: ['ing_gao', 'ing_ca_hoi', 'ing_rau_ngot', 'ing_dau_an'],
    mainIngredientIds: ['ing_ca_hoi'],
    ...overrides,
  };
}

export function contextFixture(overrides: Partial<PlanningContext> = {}): PlanningContext {
  return {
    childId: 'child-1',
    ageMonths: 8,
    stage: 2,
    health: 'normal',
    avoidAllergens: new Set(),
    avoidIngredients: new Set(),
    paused: new Set(),
    tried: new Set(['ing_ca_hoi', 'ing_rau_ngot', 'ing_dau']),
    ingredients: ingredientsFixture(),
    dishes: [dishFixture()],
    feedback: new Map(),
    ...overrides,
  };
}

const MAIN_VARIANTS: PlanDish['variants'] = [
  { stage: 1, texture: 'puree_smooth', portionText: '2–3 thìa' },
  { stage: 2, texture: 'lumpy', portionText: 'Khoảng 125 ml' },
  { stage: 3, texture: 'minced_soft', portionText: 'Khoảng 125 ml' },
  { stage: 4, texture: 'family', portionText: '175–250 ml' },
];

const SNACK_VARIANTS: PlanDish['variants'] = MAIN_VARIANTS.map((v) => ({
  ...v,
  portionText: 'Khoảng 70 ml',
}));

/** A catalog large enough to plan whole weeks: 3 dishes per protein plus snacks. */
export function catalogFixture(): { ingredients: Map<string, PlanIngredient>; dishes: PlanDish[] } {
  const ingredients = new Map<string, PlanIngredient>();
  const add = (i: PlanIngredient) => ingredients.set(i.id, i);
  add({
    id: 'ing_gao',
    name: 'Gạo',
    foodGroup: 'carb',
    proteinSource: null,
    allergenTags: [],
    minAgeMonths: 6,
  });
  add({
    id: 'ing_dau_an',
    name: 'Dầu',
    foodGroup: 'fat',
    proteinSource: null,
    allergenTags: [],
    minAgeMonths: 6,
  });
  const proteins: [
    string,
    string,
    PlanIngredient['proteinSource'],
    PlanIngredient['allergenTags'],
  ][] = [
    ['ing_ca', 'Cá', 'fish', ['fish']],
    ['ing_ga', 'Gà', 'chicken', []],
    ['ing_bo', 'Bò', 'beef', []],
    ['ing_heo', 'Heo', 'pork', []],
    ['ing_dau_phu', 'Đậu phụ', 'legume', ['soy']],
    ['ing_trung', 'Trứng', 'egg', ['egg']],
  ];
  for (const [id, name, source, tags] of proteins) {
    add({
      id,
      name,
      foodGroup: 'protein',
      proteinSource: source,
      allergenTags: tags,
      minAgeMonths: 6,
    });
  }
  const vegs = ['ing_bi', 'ing_ca_rot', 'ing_rau'];
  vegs.forEach((id, i) =>
    add({
      id,
      name: `Rau ${i}`,
      foodGroup: 'veg',
      proteinSource: null,
      allergenTags: [],
      minAgeMonths: 6,
    }),
  );
  ['ing_chuoi', 'ing_le', 'ing_bo_qua', 'ing_tao'].forEach((id) =>
    add({
      id,
      name: id,
      foodGroup: 'fruit',
      proteinSource: null,
      allergenTags: [],
      minAgeMonths: 6,
    }),
  );

  const dishes: PlanDish[] = [];
  for (const [proteinId, , source] of proteins) {
    vegs.forEach((veg, i) =>
      dishes.push({
        id: `dish_${proteinId.slice(4)}_${i}`,
        name: `Cháo ${proteinId} ${i}`,
        mealType: 'main',
        prepMin: 5 + i,
        cookMin: 15,
        mainProtein: source,
        stages: [1, 2, 3, 4],
        variants: MAIN_VARIANTS,
        ingredientIds: ['ing_gao', proteinId, veg, 'ing_dau_an'],
        mainIngredientIds: [proteinId],
      }),
    );
  }
  ['ing_chuoi', 'ing_le', 'ing_bo_qua', 'ing_tao'].forEach((fruit) =>
    dishes.push({
      id: `dish_snack_${fruit.slice(4)}`,
      name: `Snack ${fruit}`,
      mealType: 'snack',
      prepMin: 5,
      cookMin: 0,
      mainProtein: null,
      stages: [1, 2, 3, 4],
      variants: SNACK_VARIANTS,
      ingredientIds: [fruit],
      mainIngredientIds: [fruit],
    }),
  );
  return { ingredients, dishes };
}

/** Context over catalogFixture() where every food is already familiar to the child. */
export function catalogContext(overrides: Partial<PlanningContext> = {}): PlanningContext {
  const { ingredients, dishes } = catalogFixture();
  return contextFixture({ ingredients, dishes, tried: new Set(ingredients.keys()), ...overrides });
}
