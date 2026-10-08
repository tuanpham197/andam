import { CHILD, USER, planningTestbed, snapshot } from '../../../../../test/fakes/meal-planning.js';
import { MealAlreadyLoggedError, MealNotFoundError } from '../../domain/errors.js';
import { PlannedMeal } from '../../domain/planned-meal.js';

async function planned() {
  const t = planningTestbed();
  await t.dayPlans.getDay(USER, CHILD, '2026-09-24');
  const lunch = [...t.plans.rows.values()].find((m) => m.slot === 'lunch')!;
  return { ...t, lunch };
}

describe('MealAccessService', () => {
  it('describes a meal with its foods and the ones still never eaten', async () => {
    const t = await planned();
    const protein = t.catalog.data.dishes.find((d) => d.id === t.lunch.dishId)!.ingredientIds[1]!;
    t.plans.put(
      PlannedMeal.restore({ ...snapshot(t.lunch), newIngredientIds: [protein, 'ing_bi'] }),
    );
    t.history.triedIds.delete(protein);

    const meal = await t.mealAccess.find(USER, t.lunch.id);
    expect(meal).toMatchObject({
      id: t.lunch.id,
      childId: CHILD,
      date: '2026-09-24',
      slot: 'lunch',
      time: '11:00',
      status: 'planned',
      dish: { id: t.lunch.dishId, custom: false },
      firstTryIds: [protein],
    });
    expect(meal!.ingredients[0]).toEqual({
      id: 'ing_gao',
      name: 'Gạo',
      foodGroup: 'carb',
      allergenTags: [],
    });
  });

  it('answers nothing for an unknown meal or another family’s meal', async () => {
    const t = await planned();
    expect(await t.mealAccess.find(USER, 'nope')).toBeNull();
    expect(await t.mealAccess.find('u-2', t.lunch.id)).toBeNull();
  });

  it('closes the meal once; a second parent is told it was already logged', async () => {
    const t = await planned();
    await t.mealAccess.markLogged(USER, t.lunch.id, 'refused');
    expect(t.plans.rows.get(t.lunch.id)!.status).toBe('refused');
    await expect(t.mealAccess.markLogged(USER, t.lunch.id, 'eaten')).rejects.toThrow(
      MealAlreadyLoggedError,
    );
    await expect(t.mealAccess.markLogged('u-2', t.lunch.id, 'eaten')).rejects.toThrow(
      MealNotFoundError,
    );
  });
});
