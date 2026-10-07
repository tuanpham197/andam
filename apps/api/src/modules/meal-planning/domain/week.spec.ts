import {
  catalogContext,
  contextFixture,
  dishFixture,
  ingredientsFixture,
} from '../../../../test/fakes/meal-planning-fixtures.js';
import { addDays } from '../../../shared/kernel/local-date.js';
import type { MealUse } from './model.js';
import { dayGroupsCovered, weekStats } from './week.js';

const MONDAY = '2026-09-21';
const ctx = catalogContext();
const dishOf = (protein: string, type: 'main' | 'snack' = 'main') =>
  ctx.dishes.find((d) => d.mealType === type && (type === 'snack' || d.mainProtein === protein))!;

function fullWeek(): MealUse[] {
  const proteins = ['fish', 'chicken', 'beef', 'pork', 'legume'];
  const uses: MealUse[] = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(MONDAY, i);
    uses.push(
      { date, slot: 'breakfast', dishId: dishOf(proteins[i % 5]!).id },
      { date, slot: 'lunch', dishId: dishOf(proteins[(i + 1) % 5]!).id },
      { date, slot: 'afternoon_snack', dishId: dishOf('', 'snack').id },
      { date, slot: 'dinner', dishId: dishOf(proteins[(i + 2) % 5]!).id },
    );
  }
  return uses;
}

describe('weekStats (BR-60..62)', () => {
  it('TC-WK-001 GĐ2 week: 28 meals, distinct dishes, days with the 4 groups', () => {
    const stats = weekStats(ctx, fullWeek());
    expect(stats.totalMeals).toBe(28);
    expect(stats.distinctDishes).toBe(6);
    expect(stats.daysFullGroups).toBe(7);
    expect(stats.proteinRotation.map((p) => [p.protein, p.meals])).toEqual([
      ['fish', 4],
      ['chicken', 5],
      ['beef', 5],
      ['pork', 4],
      ['legume', 3],
      ['egg', 0],
    ]);
  });

  it('TC-WK-002 an avoided source shows 0 and is flagged', () => {
    const stats = weekStats(catalogContext({ avoidAllergens: new Set(['egg']) }), fullWeek());
    expect(stats.proteinRotation.find((p) => p.protein === 'egg')).toEqual({
      protein: 'egg',
      meals: 0,
      avoided: true,
    });
  });

  it('TC-WK-003 a source at 0 that is not avoided carries no flag', () => {
    const stats = weekStats(ctx, fullWeek());
    expect(stats.proteinRotation.find((p) => p.protein === 'egg')!.avoided).toBe(false);
  });

  it('a source is avoided when every food providing it is on the avoid list', () => {
    const stats = weekStats(catalogContext({ avoidIngredients: new Set(['ing_bo']) }), []);
    expect(stats.proteinRotation.find((p) => p.protein === 'beef')!.avoided).toBe(true);
  });

  it('an empty week counts nothing', () => {
    expect(weekStats(ctx, [])).toMatchObject({
      distinctDishes: 0,
      totalMeals: 0,
      daysFullGroups: 0,
    });
  });
});

describe('dayGroupsCovered (BR-61)', () => {
  it('counts the groups of main meals only, fruit as vegetables', () => {
    expect(dayGroupsCovered(ctx, [dishOf('fish').id])).toBe(4);
    expect(dayGroupsCovered(ctx, [dishOf('', 'snack').id])).toBe(0);
  });

  it('lets fruit stand in for vegetables', () => {
    const ingredients = ingredientsFixture();
    ingredients.set('ing_chuoi', {
      id: 'ing_chuoi',
      name: 'Chuối',
      foodGroup: 'fruit',
      proteinSource: null,
      allergenTags: [],
      minAgeMonths: 6,
    });
    const dish = dishFixture({
      ingredientIds: ['ing_gao', 'ing_ca_hoi', 'ing_chuoi', 'ing_dau_an'],
    });
    expect(dayGroupsCovered(contextFixture({ ingredients, dishes: [dish] }), [dish.id])).toBe(4);
  });

  it('ignores dishes no longer in the catalog', () => {
    expect(dayGroupsCovered(ctx, ['dish_gone'])).toBe(0);
    expect(weekStats(ctx, [{ date: MONDAY, slot: 'lunch', dishId: 'dish_gone' }]).totalMeals).toBe(
      1,
    );
  });
});
