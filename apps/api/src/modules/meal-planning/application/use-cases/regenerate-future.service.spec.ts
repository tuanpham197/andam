import { CHILD, USER, planningTestbed, snapshot } from '../../../../../test/fakes/meal-planning.js';
import { PlannedMeal } from '../../domain/planned-meal.js';

const TODAY = '2026-09-24';

async function planToday() {
  const t = planningTestbed();
  await t.dayPlans.getDay(USER, CHILD, TODAY);
  await t.dayPlans.getDay(USER, CHILD, '2026-09-25');
  return t;
}

const mealsOn = (t: Awaited<ReturnType<typeof planToday>>, date: string) =>
  [...t.plans.rows.values()]
    .filter((m) => m.date === date)
    .sort((a, b) => a.time.localeCompare(b.time));

describe('RegenerateFutureService (BR-31, TC-PLN-003)', () => {
  it('replaces future meals that became unsafe after the avoid list changed', async () => {
    const t = await planToday();
    t.children.rows.get(CHILD)!.info.avoidAllergens = ['fish', 'egg', 'soy'];
    await t.regenerate.execute({ childId: CHILD, userId: USER });
    const all = [...t.plans.rows.values()];
    const dishes = await t.catalog.dishes();
    const protein = (id: string) => dishes.find((d) => d.id === id)!.mainProtein;
    expect(
      all
        .filter((m) => m.time > '09:00' || m.date > TODAY)
        .some((m) => ['fish', 'egg', 'legume'].includes(protein(m.dishId) ?? '')),
    ).toBe(false);
    expect(mealsOn(t, '2026-09-25')).toHaveLength(4);
  });

  it('keeps meals already past, prepared or logged', async () => {
    const t = await planToday();
    const [breakfast, lunch] = mealsOn(t, TODAY);
    t.plans.put(PlannedMeal.restore({ ...snapshot(lunch!), status: 'prepared' }));
    const before = { breakfast: breakfast!.dishId, lunch: lunch!.dishId };

    // Both meals now contain an avoided food, yet they are past or already cooked.
    const dishes = await t.catalog.dishes();
    const proteinOf = (dishId: string) => dishes.find((d) => d.id === dishId)!.ingredientIds[1]!;
    t.children.rows.get(CHILD)!.info.avoidIngredients = [
      proteinOf(breakfast!.dishId),
      proteinOf(lunch!.dishId),
    ];
    await t.regenerate.execute({ childId: CHILD, userId: USER });

    const [b, l] = mealsOn(t, TODAY);
    expect(b!.dishId).toBe(before.breakfast); // 07:30 is before 09:00
    expect(l!.dishId).toBe(before.lunch); // prepared
    expect(l!.status).toBe('prepared');
  });

  it('keeps a swapped meal that is still safe and replaces one that is not', async () => {
    const t = await planToday();
    const [, , snack, dinner] = mealsOn(t, TODAY);
    t.plans.put(PlannedMeal.restore({ ...snapshot(dinner!), source: 'swap', dishId: 'dish_ga_2' }));
    t.plans.put(
      PlannedMeal.restore({ ...snapshot(snack!), source: 'swap', dishId: 'dish_snack_le' }),
    );

    t.children.rows.get(CHILD)!.info.avoidIngredients = ['ing_le'];
    await t.regenerate.execute({ childId: CHILD, userId: USER });

    const meals = mealsOn(t, TODAY);
    expect(meals.find((m) => m.slot === 'dinner')!.dishId).toBe('dish_ga_2');
    expect(meals.find((m) => m.slot === 'afternoon_snack')!.dishId).not.toBe('dish_snack_le');
  });

  it('follows a stage change: regenerated meals use the new texture', async () => {
    const t = await planToday();
    t.children.rows.get(CHILD)!.info.stage = 1;
    await t.regenerate.execute({ childId: CHILD, userId: USER });
    const tomorrow = mealsOn(t, '2026-09-25');
    expect(tomorrow.map((m) => m.slot)).toEqual(['breakfast', 'lunch']);
    expect(tomorrow.every((m) => m.texture === 'puree_smooth')).toBe(true);
  });

  it('removes future meals when the child leaves the planning age', async () => {
    const t = await planToday();
    t.children.rows.get(CHILD)!.info.stage = null;
    await t.regenerate.execute({ childId: CHILD, userId: USER });
    expect(mealsOn(t, '2026-09-25')).toHaveLength(0);
    expect(mealsOn(t, TODAY).map((m) => m.slot)).toEqual(['breakfast']);
  });

  it('does nothing for a child that does not exist (any more)', async () => {
    const t = await planToday();
    const before = t.plans.rows.size;
    await t.regenerate.execute({ childId: 'ghost', userId: USER });
    expect(t.plans.rows.size).toBe(before);
  });

  describe('after a health change (BR-50..53, TC-HLT-008/010)', () => {
    it('re-plans the upcoming meals for the sick days and keeps the prepared one', async () => {
      const t = await planToday();
      const lunch = mealsOn(t, TODAY).find((m) => m.slot === 'lunch')!;
      t.plans.put(PlannedMeal.restore({ ...snapshot(lunch), status: 'prepared' }));
      t.history.healthState = 'sick';
      await t.regenerate.execute({ childId: CHILD, userId: USER });

      const today = mealsOn(t, TODAY);
      expect(today.find((m) => m.slot === 'lunch')).toMatchObject({
        id: lunch.id,
        status: 'prepared',
        texture: 'lumpy',
      });
      expect(today.find((m) => m.slot === 'dinner')).toMatchObject({
        texture: 'mashed',
        portionText: 'Khoảng 90 ml',
      });
      expect(mealsOn(t, '2026-09-25')).toHaveLength(5);
    });

    it('serves a parent’s swapped dish softer instead of replacing it', async () => {
      const t = await planToday();
      const tomorrow = mealsOn(t, '2026-09-25');
      for (const meal of tomorrow)
        t.plans.put(PlannedMeal.restore({ ...snapshot(meal), source: 'swap' }));
      t.history.healthOn.set('2026-09-25', 'sick');
      await t.regenerate.execute({ childId: CHILD, userId: USER });

      const after = mealsOn(t, '2026-09-25');
      expect(after).toHaveLength(5); // the extra snack is added on a day of swaps only
      for (const meal of tomorrow) {
        const kept = after.find((m) => m.id === meal.id)!;
        expect(kept.dishId).toBe(meal.dishId);
        expect(kept.texture).toBe('mashed');
      }
      // Back to normal: the day is untouched for swapped meals already served as normal.
      t.history.healthOn.clear();
      await t.regenerate.execute({ childId: CHILD, userId: USER });
      expect(mealsOn(t, TODAY).every((m) => m.texture === 'lumpy')).toBe(true);
      expect(mealsOn(t, '2026-09-25').filter((m) => m.slot.endsWith('snack'))).toHaveLength(1);
    });
  });
});
