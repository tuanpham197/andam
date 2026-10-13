import type { PlanIngredient } from './model.js';
import { foodProgress, type FoodProgressInput } from './food-progress.js';

const food = (
  id: string,
  name: string,
  foodGroup: PlanIngredient['foodGroup'],
  extra: Partial<PlanIngredient> = {},
): PlanIngredient => ({
  id,
  name,
  foodGroup,
  proteinSource: null,
  allergenTags: [],
  minAgeMonths: 6,
  ...extra,
});

const FOODS = [
  food('ing_gao', 'Gạo', 'carb'),
  food('ing_trung', 'Trứng gà', 'protein', { allergenTags: ['egg'] }),
  food('ing_ga', 'Thịt gà', 'protein'),
  food('ing_ca_hoi', 'Cá hồi', 'protein', { allergenTags: ['fish'] }),
  food('ing_bi_do', 'Bí đỏ', 'veg'),
  food('ing_rau_ngot', 'Rau ngót', 'veg'),
  food('ing_muop_dang', 'Mướp đắng', 'veg'),
  food('ing_chuoi', 'Chuối', 'fruit'),
  food('ing_mat_ong', 'Mật ong', 'fruit', { minAgeMonths: 12 }),
];

const input = (overrides: Partial<FoodProgressInput> = {}): FoodProgressInput => ({
  ageMonths: 8,
  ingredients: FOODS,
  avoidAllergens: new Set(['egg']),
  avoidIngredients: new Set(['ing_muop_dang']),
  tried: new Set(['ing_ga', 'ing_bi_do']),
  paused: new Set(['ing_rau_ngot']),
  upcoming: [],
  ...overrides,
});

describe('foodProgress (BR-96)', () => {
  it('TC-UX-014 sorts tracked foods into statuses and counts progress without avoided or too-early foods', () => {
    const result = foodProgress(input());
    const status = Object.fromEntries(
      result.groups.flatMap((g) => g.items.map((i) => [i.id, i.status])),
    );
    expect(status).toEqual({
      ing_trung: 'avoided',
      ing_ga: 'tried',
      ing_ca_hoi: 'new',
      ing_bi_do: 'tried',
      ing_rau_ngot: 'paused',
      ing_muop_dang: 'avoided',
      ing_chuoi: 'new',
      ing_mat_ong: 'not_yet',
    });
    expect(result.summary).toEqual({ tried: 2, total: 5, paused: 1, avoided: 2, notYet: 1 });
    expect(result.groups.map((g) => g.group)).toEqual(['protein', 'veg', 'fruit']);
    expect(result.groups[0]!.items.map((i) => i.name)).toEqual(['Cá hồi', 'Thịt gà', 'Trứng gà']);
    expect(result.groups[2]!.items.find((i) => i.id === 'ing_mat_ong')!.minAgeMonths).toBe(12);
  });

  it('TC-UX-015 gives the nearest day a new food is planned, only for foods still new', () => {
    const result = foodProgress(
      input({
        upcoming: [
          { date: '2026-10-04', newIngredientIds: ['ing_ca_hoi', 'ing_ga'] },
          { date: '2026-09-27', newIngredientIds: ['ing_ca_hoi'] },
          { date: '2026-09-30', newIngredientIds: ['ing_ca_hoi'] },
        ],
      }),
    );
    const items = result.groups.flatMap((g) => g.items);
    expect(items.find((i) => i.id === 'ing_ca_hoi')!.upcomingOn).toBe('2026-09-27');
    expect(items.find((i) => i.id === 'ing_ga')!.upcomingOn).toBeNull();
    expect(items.find((i) => i.id === 'ing_chuoi')!.upcomingOn).toBeNull();
  });
});
