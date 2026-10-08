import { CHILD, USER, planningTestbed, snapshot } from '../../../../../test/fakes/meal-planning.js';
import {
  InvalidDateError,
  MealAlreadyLoggedError,
  MealNotFoundError,
  PlanChildNotFoundError,
} from '../../domain/errors.js';
import { PlannedMeal } from '../../domain/planned-meal.js';

const TODAY = '2026-09-24';

describe('DayPlanService.getDay (UC-04, UC-16)', () => {
  it('TC-ENG-001 plans today on first read: 3 main meals and 1 snack, with dish details', async () => {
    const t = planningTestbed();
    const plan = await t.dayPlans.getDay(USER, CHILD, TODAY);
    expect(plan.plannable).toBe(true);
    expect(plan.meals.map((m) => [m.slot, m.time, m.status])).toEqual([
      ['breakfast', '07:30', 'planned'],
      ['lunch', '11:00', 'planned'],
      ['afternoon_snack', '15:00', 'planned'],
      ['dinner', '18:00', 'planned'],
    ]);
    expect(plan.meals[0]!.dish).toMatchObject({
      name: expect.any(String),
      prepMin: expect.any(Number),
      cookMin: 15,
    });
    expect(plan.meals[0]!.dish.foodGroups).toEqual(['carb', 'protein', 'fat', 'veg']);
    expect(plan.meals[0]).toMatchObject({ texture: 'lumpy', portionText: 'Khoảng 125 ml' });
    expect(plan.unfilledSlots).toEqual([]);
    expect(plan.nextMealId).toBe(plan.meals[0]!.id);
    expect(t.plans.rows.size).toBe(4);
  });

  it('returns the stored plan on the next read instead of planning again', async () => {
    const t = planningTestbed();
    const first = await t.dayPlans.getDay(USER, CHILD, TODAY);
    t.catalog.data.dishes.reverse();
    const second = await t.dayPlans.getDay(USER, CHILD, TODAY);
    expect(second.meals.map((m) => m.id)).toEqual(first.meals.map((m) => m.id));
  });

  it('TC-PLN-001 survives two simultaneous first reads: one plan is stored, both see it', async () => {
    const t = planningTestbed();
    const [a, b] = await Promise.all([
      t.dayPlans.getDay(USER, CHILD, TODAY),
      t.dayPlans.getDay(USER, CHILD, TODAY),
    ]);
    expect(t.plans.rows.size).toBe(4);
    expect(a.meals.map((m) => m.id)).toEqual(b.meals.map((m) => m.id));
  });

  it('BR-01 never plans a dish with an avoided allergen', async () => {
    const t = planningTestbed();
    t.children.rows.get(CHILD)!.info.avoidAllergens = ['fish', 'egg'];
    const plan = await t.dayPlans.getDay(USER, CHILD, TODAY);
    expect(plan.meals.every((m) => !['fish', 'egg'].includes(m.dish.mainProtein ?? ''))).toBe(true);
  });

  it('BR-03 never plans a dish with a paused ingredient', async () => {
    const t = planningTestbed();
    t.history.pausedIds = new Set(['ing_ga', 'ing_bo', 'ing_heo']);
    const plan = await t.dayPlans.getDay(USER, CHILD, TODAY);
    expect(
      plan.meals.some((m) => ['chicken', 'beef', 'pork'].includes(m.dish.mainProtein ?? '')),
    ).toBe(false);
  });

  it('FR-118 says who logged a meal; pending meals have nobody yet', async () => {
    const t = planningTestbed();
    await t.dayPlans.getDay(USER, CHILD, TODAY);
    const breakfast = [...t.plans.rows.values()].find((m) => m.slot === 'breakfast')!;
    t.plans.put(PlannedMeal.restore({ ...snapshot(breakfast), status: 'eaten' }));
    const at = new Date('2026-09-24T00:45:00Z');
    t.history.logged.set(breakfast.id, { name: 'Ba', at });
    const day = await t.dayPlans.getDay(USER, CHILD, TODAY);
    expect(day.meals.find((m) => m.id === breakfast.id)!.loggedBy).toEqual({ name: 'Ba', at });
    expect(day.meals.filter((m) => m.id !== breakfast.id).every((m) => m.loggedBy === null)).toBe(
      true,
    );
  });

  it('lists first tries with their names (FR-024)', async () => {
    const t = planningTestbed();
    t.history.triedIds = new Set(['ing_gao', 'ing_dau_an']);
    const plan = await t.dayPlans.getDay(USER, CHILD, TODAY);
    expect(plan.meals[0]!.newIngredients.length).toBeGreaterThan(0);
    expect(plan.meals[0]!.newIngredients[0]).toEqual({
      id: expect.any(String),
      name: expect.any(String),
    });
  });

  it('TC-ENG-004 reports the slots it could not fill', async () => {
    const t = planningTestbed();
    t.children.rows.get(CHILD)!.info.avoidIngredients = [
      'ing_chuoi',
      'ing_le',
      'ing_bo_qua',
      'ing_tao',
    ];
    const plan = await t.dayPlans.getDay(USER, CHILD, TODAY);
    expect(plan.unfilledSlots).toEqual([{ slot: 'afternoon_snack', time: '15:00' }]);
    expect(plan.meals).toHaveLength(3);
  });

  it('adds the extra snack while the baby is sick (BR-50)', async () => {
    const t = planningTestbed();
    t.history.healthState = 'sick';
    const plan = await t.dayPlans.getDay(USER, CHILD, TODAY);
    expect(plan.meals.filter((m) => m.slot.endsWith('snack'))).toHaveLength(2);
  });

  it('BR-25 respects an allergen introduction already planned for yesterday', async () => {
    const t = planningTestbed();
    t.history.triedIds = new Set([...t.history.triedIds].filter((id) => id !== 'ing_ca'));
    t.plans.put(
      PlannedMeal.restore({
        id: 'yesterday',
        childId: CHILD,
        date: '2026-09-23',
        slot: 'lunch',
        time: '11:00',
        dishId: 'dish_ca_0',
        stageId: 2,
        texture: 'lumpy',
        portionText: 'x',
        status: 'planned',
        newIngredientIds: ['ing_ca'],
        source: 'auto',
        generatedAt: new Date(),
      }),
    );
    const plan = await t.dayPlans.getDay(USER, CHILD, TODAY);
    expect(plan.meals.some((m) => m.dish.mainProtein === 'fish')).toBe(false);
  });

  it('TC-PLN-002 never plans a day in the past', async () => {
    const t = planningTestbed();
    const plan = await t.dayPlans.getDay(USER, CHILD, '2026-09-23');
    expect(plan).toMatchObject({ meals: [], unfilledSlots: [], nextMealId: null });
    expect(t.plans.rows.size).toBe(0);
  });

  it('plans up to 13 days ahead, not further', async () => {
    const t = planningTestbed();
    expect((await t.dayPlans.getDay(USER, CHILD, '2026-10-07')).meals).toHaveLength(4);
    expect((await t.dayPlans.getDay(USER, CHILD, '2026-10-08')).meals).toHaveLength(0);
  });

  it('does not plan for a baby who is not in the planning age', async () => {
    const t = planningTestbed();
    t.children.rows.get(CHILD)!.info.stage = null;
    const plan = await t.dayPlans.getDay(USER, CHILD, TODAY);
    expect(plan).toMatchObject({ plannable: false, meals: [], unfilledSlots: [] });
  });

  it.each(['2026-02-30', '24-09-2026', 'today'])('rejects the date %j', async (date) => {
    const t = planningTestbed();
    await expect(t.dayPlans.getDay(USER, CHILD, date)).rejects.toThrow(InvalidDateError);
  });

  it('TC-CHD-013 treats another user’s child as not found', async () => {
    const t = planningTestbed();
    await expect(t.dayPlans.getDay('stranger', CHILD, TODAY)).rejects.toThrow(
      PlanChildNotFoundError,
    );
  });

  it('TC-NXT-002 points to the earliest meal still pending', async () => {
    const t = planningTestbed();
    const plan = await t.dayPlans.getDay(USER, CHILD, TODAY);
    await t.dayPlans.markPrepared(USER, plan.meals[0]!.id);
    const again = await t.dayPlans.getDay(USER, CHILD, TODAY);
    expect(again.meals[0]!.status).toBe('prepared');
    expect(again.nextMealId).toBe(plan.meals[0]!.id);
  });
});

describe('DayPlanService.markPrepared (FR-025)', () => {
  it('marks my meal as prepared', async () => {
    const t = planningTestbed();
    const plan = await t.dayPlans.getDay(USER, CHILD, TODAY);
    await expect(t.dayPlans.markPrepared(USER, plan.meals[1]!.id)).resolves.toEqual({
      id: plan.meals[1]!.id,
      status: 'prepared',
    });
  });

  it('treats another user’s meal as not found', async () => {
    const t = planningTestbed();
    const plan = await t.dayPlans.getDay(USER, CHILD, TODAY);
    await expect(t.dayPlans.markPrepared('stranger', plan.meals[0]!.id)).rejects.toThrow(
      MealNotFoundError,
    );
  });

  it('TC-PLN-004 refuses a meal already eaten', async () => {
    const t = planningTestbed();
    const plan = await t.dayPlans.getDay(USER, CHILD, TODAY);
    const stored = t.plans.rows.get(plan.meals[0]!.id)!;
    t.plans.put(PlannedMeal.restore({ ...snapshot(stored), status: 'eaten' }));
    await expect(t.dayPlans.markPrepared(USER, plan.meals[0]!.id)).rejects.toThrow(
      MealAlreadyLoggedError,
    );
  });

  describe('healthPreview (FR-083)', () => {
    it('describes what the menu does for a status', async () => {
      const t = planningTestbed();
      expect(await t.dayPlans.healthPreview(USER, CHILD, 'recovering')).toEqual({
        status: 'recovering',
        extraSnacks: 0,
        portionPercent: 85,
        softerTexture: 0,
        pauseNewFoods: true,
      });
    });

    it('hides another user’s child', async () => {
      const t = planningTestbed();
      await expect(t.dayPlans.healthPreview('u-2', CHILD, 'sick')).rejects.toThrow(
        PlanChildNotFoundError,
      );
    });
  });

  it('plans each day with that day’s health (FR-082)', async () => {
    const t = planningTestbed();
    t.history.healthOn.set('2026-09-25', 'sick');
    await t.dayPlans.getDay(USER, CHILD, TODAY);
    const sickDay = await t.dayPlans.getDay(USER, CHILD, '2026-09-25');
    expect(sickDay.meals).toHaveLength(5);
    expect(sickDay.meals[0]).toMatchObject({ texture: 'mashed', portionText: 'Khoảng 90 ml' });
  });
});
