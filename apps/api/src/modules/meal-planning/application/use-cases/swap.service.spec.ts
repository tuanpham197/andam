import { CHILD, USER, planningTestbed, snapshot } from '../../../../../test/fakes/meal-planning.js';
import {
  ChildNotPlannableError,
  DishNotForSlotError,
  DishNotFoundError,
  DishNotSafeError,
  MealAlreadyLoggedError,
  MealChangedError,
  MealInPastError,
  MealNotFoundError,
  SameDishError,
} from '../../domain/errors.js';
import { PlannedMeal } from '../../domain/planned-meal.js';

const TODAY = '2026-09-24';

/** Today planned for bé Na (GĐ2: breakfast, lunch, snack, dinner); the clock reads 09:00. */
async function planned() {
  const t = planningTestbed();
  await t.dayPlans.getDay(USER, CHILD, TODAY);
  const meals = [...t.plans.rows.values()].sort((a, b) => a.time.localeCompare(b.time));
  const [breakfast, lunch, snack, dinner] = meals;
  return { ...t, breakfast: breakfast!, lunch: lunch!, snack: snack!, dinner: dinner! };
}

const proteinOf = async (t: Awaited<ReturnType<typeof planned>>, dishId: string) =>
  (await t.catalog.dishes()).find((d) => d.id === dishId)!.mainProtein;

describe('SwapService.suggestions (UC-06)', () => {
  it('describes the meal and ranks replacements with their dish details', async () => {
    const t = await planned();
    const view = await t.swaps.suggestions(USER, t.lunch.id, 'other');
    expect(view.meal).toEqual({
      id: t.lunch.id,
      slot: 'lunch',
      time: '11:00',
      dish: { id: t.lunch.dishId, name: expect.any(String) },
    });
    expect(view.reason).toBe('other');
    expect(view.ranked.length).toBeGreaterThan(0);
    const best = view.ranked[0]!;
    expect(best.dish).toMatchObject({ id: expect.any(String), foodGroups: expect.any(Array) });
    expect(best).toMatchObject({ texture: 'lumpy', newIngredients: [], repeatInDays: null });
    expect(view.ranked.map((c) => c.dish.id)).not.toContain(t.lunch.dishId);
    expect(view.relaxedWindowDays).toBeNull();
    expect(view.excluded.total).toBe(0);
  });

  it('names the proteins of the other main meals of the day, not the snack nor the meal itself', async () => {
    const t = await planned();
    const view = await t.swaps.suggestions(USER, t.lunch.id, 'other');
    expect(view.otherMains).toEqual([
      { slot: 'breakfast', protein: await proteinOf(t, t.breakfast.dishId) },
      { slot: 'dinner', protein: await proteinOf(t, t.dinner.dishId) },
    ]);
  });

  it('names first-try foods by their name', async () => {
    const t = await planned();
    t.history.triedIds = new Set(['ing_gao', 'ing_dau_an']);
    const view = await t.swaps.suggestions(USER, t.lunch.id, 'other');
    expect(view.ranked[0]!.newIngredients[0]).toEqual({
      id: expect.any(String),
      name: expect.any(String),
    });
  });

  it('counts the dishes the safety filter removed', async () => {
    const t = await planned();
    t.children.rows.get(CHILD)!.info.avoidAllergens = ['egg'];
    const view = await t.swaps.suggestions(USER, t.lunch.id, 'other');
    expect(view.excluded.byReason.allergen).toBe(3);
  });

  it('answers MEAL_NOT_FOUND for an unknown meal or another family’s meal', async () => {
    const t = await planned();
    await expect(t.swaps.suggestions(USER, 'nope', 'other')).rejects.toThrow(MealNotFoundError);
    await expect(t.swaps.suggestions('u-2', t.lunch.id, 'other')).rejects.toThrow(
      MealNotFoundError,
    );
  });

  it.each(['eaten', 'refused'] as const)('TC-SWP-006 refuses a %s meal', async (status) => {
    const t = await planned();
    t.plans.put(PlannedMeal.restore({ ...snapshot(t.lunch), status }));
    await expect(t.swaps.suggestions(USER, t.lunch.id, 'other')).rejects.toThrow(
      MealAlreadyLoggedError,
    );
  });

  it('TC-SWP-010 refuses a meal of a past day, but not today’s overdue breakfast', async () => {
    const t = await planned();
    t.plans.put(PlannedMeal.restore({ ...snapshot(t.lunch), id: 'm-old', date: '2026-09-23' }));
    await expect(t.swaps.suggestions(USER, 'm-old', 'other')).rejects.toThrow(MealInPastError);
    // 07:30 has passed at 09:00, yet the parent may still change today's breakfast.
    await expect(t.swaps.suggestions(USER, t.breakfast.id, 'other')).resolves.toBeDefined();
  });

  it('refuses when the child is no longer planned (outgrown or too young)', async () => {
    const t = await planned();
    t.children.rows.get(CHILD)!.info.stage = null;
    await expect(t.swaps.suggestions(USER, t.lunch.id, 'other')).rejects.toThrow(
      ChildNotPlannableError,
    );
  });
});

describe('SwapService.apply (FR-045)', () => {
  it('replaces the dish, returns the updated meal and records the swap with its reason', async () => {
    const t = await planned();
    const { ranked } = await t.swaps.suggestions(USER, t.lunch.id, 'missing_ingredient');
    const target = ranked[0]!.dish;
    const view = await t.swaps.apply(USER, t.lunch.id, {
      dishId: target.id,
      reason: 'missing_ingredient',
    });
    expect(view).toMatchObject({
      id: t.lunch.id,
      slot: 'lunch',
      status: 'planned',
      dish: target,
      texture: 'lumpy',
    });
    expect(t.plans.rows.get(t.lunch.id)).toMatchObject({ dishId: target.id, source: 'swap' });
    expect(t.plans.swaps).toEqual([
      {
        id: expect.any(String),
        mealId: t.lunch.id,
        fromDishId: t.lunch.dishId,
        toDishId: target.id,
        reason: 'missing_ingredient',
        createdAt: t.clock.now(),
        actorId: USER,
      },
    ]);
    expect(t.uow.runs).toBe(1);
  });

  it('TC-SWP-004 records "bé không thích" as a signal without touching the avoid list', async () => {
    const t = await planned();
    const { ranked } = await t.swaps.suggestions(USER, t.lunch.id, 'disliked');
    await t.swaps.apply(USER, t.lunch.id, { dishId: ranked[0]!.dish.id, reason: 'disliked' });
    expect(t.plans.swaps[0]!.reason).toBe('disliked');
    expect(t.children.rows.get(CHILD)!.info.avoidIngredients).toEqual([]);
  });

  it('flags the first tries of the new dish', async () => {
    const t = await planned();
    t.history.triedIds = new Set(['ing_gao', 'ing_dau_an', 'ing_bi']);
    const view = await t.swaps.apply(USER, t.lunch.id, { dishId: 'dish_heo_0', reason: 'other' });
    expect(view.newIngredients).toEqual([{ id: 'ing_heo', name: 'Heo' }]);
    expect(t.plans.rows.get(t.lunch.id)!.newIngredientIds).toEqual(['ing_heo']);
  });

  it('TC-SWP-008 refuses an unsafe dish sent by a hand-made request, saving nothing', async () => {
    const t = await planned();
    t.children.rows.get(CHILD)!.info.avoidAllergens = ['egg'];
    const error = await t.swaps
      .apply(USER, t.lunch.id, { dishId: 'dish_trung_0', reason: 'other' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DishNotSafeError);
    expect((error as DishNotSafeError).reason).toBe('allergen');
    expect(t.plans.rows.get(t.lunch.id)!.dishId).toBe(t.lunch.dishId);
    expect(t.plans.swaps).toEqual([]);
  });

  it('TC-SWP-009 answers DISH_NOT_FOUND for a dish not in the catalog', async () => {
    const t = await planned();
    await expect(
      t.swaps.apply(USER, t.lunch.id, { dishId: 'dish_khong_co', reason: 'other' }),
    ).rejects.toThrow(DishNotFoundError);
  });

  it('TC-SWP-007 refuses the dish the meal already has', async () => {
    const t = await planned();
    await expect(
      t.swaps.apply(USER, t.lunch.id, { dishId: t.lunch.dishId, reason: 'other' }),
    ).rejects.toThrow(SameDishError);
  });

  it('TC-SWP-016 refuses a snack for a main meal and a main dish for a snack', async () => {
    const t = await planned();
    await expect(
      t.swaps.apply(USER, t.lunch.id, { dishId: 'dish_snack_le', reason: 'other' }),
    ).rejects.toThrow(DishNotForSlotError);
    await expect(
      t.swaps.apply(USER, t.snack.id, { dishId: 'dish_ga_0', reason: 'other' }),
    ).rejects.toThrow(DishNotForSlotError);
  });

  it('applies the same checks as the suggestions (logged, past, ownership)', async () => {
    const t = await planned();
    t.plans.put(PlannedMeal.restore({ ...snapshot(t.lunch), status: 'eaten' }));
    await expect(
      t.swaps.apply(USER, t.lunch.id, { dishId: 'dish_heo_0', reason: 'other' }),
    ).rejects.toThrow(MealAlreadyLoggedError);
    await expect(
      t.swaps.apply('u-2', t.dinner.id, { dishId: 'dish_heo_0', reason: 'other' }),
    ).rejects.toThrow(MealNotFoundError);
  });

  it('TC-FAM-021 refuses when the parent chose looking at a dish the meal no longer has', async () => {
    const t = await planned();
    const target = t.lunch.dishId === 'dish_heo_0' ? 'dish_heo_1' : 'dish_heo_0';
    await expect(
      t.swaps.apply(USER, t.lunch.id, {
        dishId: target,
        reason: 'other',
        expectedDishId: 'dish_x',
      }),
    ).rejects.toThrow(MealChangedError);
    await expect(
      t.swaps.apply(USER, t.lunch.id, {
        dishId: target,
        reason: 'other',
        expectedDishId: t.lunch.dishId,
      }),
    ).resolves.toMatchObject({ dish: { id: target } });
  });

  it('TC-FAM-021 another member’s swap landing first wins; this one changes nothing', async () => {
    const t = await planned();
    t.plans.saveSwap = async () => false;
    const target = t.lunch.dishId === 'dish_heo_0' ? 'dish_heo_1' : 'dish_heo_0';
    await expect(
      t.swaps.apply(USER, t.lunch.id, { dishId: target, reason: 'other' }),
    ).rejects.toThrow(MealChangedError);
    expect(t.plans.swaps).toEqual([]);
  });

  it('TC-SWP-015 puts a prepared meal back to planned', async () => {
    const t = await planned();
    t.plans.put(PlannedMeal.restore({ ...snapshot(t.dinner), status: 'prepared' }));
    const target = t.dinner.dishId === 'dish_heo_1' ? 'dish_heo_2' : 'dish_heo_1';
    const view = await t.swaps.apply(USER, t.dinner.id, { dishId: target, reason: 'faster' });
    expect(view.status).toBe('planned');
  });

  it('TC-SWP-014 keeps the meal unchanged when the swap cannot be recorded (one transaction)', async () => {
    const t = await planned();
    t.plans.recordSwap = async () => {
      throw new Error('database down');
    };
    const target = t.lunch.dishId === 'dish_heo_0' ? 'dish_heo_1' : 'dish_heo_0';
    await expect(
      t.swaps.apply(USER, t.lunch.id, { dishId: target, reason: 'other' }),
    ).rejects.toThrow('database down');
    expect(t.plans.rows.get(t.lunch.id)).toMatchObject({
      dishId: t.lunch.dishId,
      source: 'auto',
    });
  });
});
