import { careTestbed } from '../../../../../test/fakes/care.js';
import { CHILD, USER, changedMeal, snapshot } from '../../../../../test/fakes/meal-planning.js';
import { MealLog } from '../../domain/meal-log.js';
import {
  LogMealNotFoundError,
  MealLoggedTwiceError,
  ReactionWithoutSymptomError,
} from '../../domain/errors.js';

const TODAY = '2026-09-24';

const snapshotLog = (l: MealLog) => ({
  id: l.id,
  mealId: l.mealId,
  childId: l.childId,
  dishId: l.dishId,
  loggedAt: l.loggedAt,
  amount: l.amount,
  liking: l.liking,
  reaction: l.reaction,
  actorId: l.actorId,
});
const TOMORROW = '2026-09-25';
// 12:00 in Vietnam: lunch (11:00) is over, dinner (18:00) is still ahead.
const NOON = new Date('2026-09-24T05:00:00Z');

/** Today and tomorrow planned; lunch is a fish porridge with pumpkin ("Rau 0") tried for the first time. */
async function lunchWithFirstTry() {
  const t = careTestbed();
  await t.dayPlans.getDay(USER, CHILD, TODAY);
  await t.dayPlans.getDay(USER, CHILD, TOMORROW);
  const lunch = [...t.plans.rows.values()].find((m) => m.date === TODAY && m.slot === 'lunch')!;
  t.plans.put(changedMeal(lunch, { dishId: 'dish_ca_0', newIngredientIds: ['ing_bi'] }));
  t.history.triedIds.delete('ing_bi');
  t.clock.set(NOON);
  return { ...t, lunch: t.plans.rows.get(lunch.id)! };
}

/** Upcoming meals (after noon today) still using the food; past meals never change (BR-31). */
const usesFood = (t: Awaited<ReturnType<typeof lunchWithFirstTry>>, food: string) =>
  [...t.plans.rows.values()].filter(
    (m) =>
      m.isPending &&
      (m.date > TODAY || m.time > '12:00') &&
      t.catalog.data.dishes.find((d) => d.id === m.dishId)!.ingredientIds.includes(food),
  );

describe('LogMealService.form (S07)', () => {
  it('describes the meal, its first tries and what a reaction would pause', async () => {
    const t = await lunchWithFirstTry();
    expect(await t.logMeals.form(USER, t.lunch.id)).toEqual({
      meal: {
        id: t.lunch.id,
        date: TODAY,
        slot: 'lunch',
        time: '11:00',
        status: 'planned',
        dish: { id: 'dish_ca_0', name: 'Cháo ing_ca 0', custom: false },
      },
      firstTryIngredients: [{ id: 'ing_bi', name: 'Rau 0' }],
      suspectIngredients: [{ id: 'ing_bi', name: 'Rau 0' }],
      log: null,
    });
  });

  it('shows the log once the meal is logged', async () => {
    const t = await lunchWithFirstTry();
    await t.logMeals.log(USER, t.lunch.id, { loggedAt: NOON, amount: 'half', liking: 3 });
    const form = await t.logMeals.form(USER, t.lunch.id);
    expect(form.meal.status).toBe('eaten');
    expect(form.log).toMatchObject({ amount: 'half', liking: 3, outcome: 'eaten', reaction: null });
  });

  it('TC-LOG-014 answers MEAL_NOT_FOUND for an unknown or another family’s meal', async () => {
    const t = await lunchWithFirstTry();
    await expect(t.logMeals.form(USER, 'nope')).rejects.toThrow(LogMealNotFoundError);
    await expect(t.logMeals.form('u-2', t.lunch.id)).rejects.toThrow(LogMealNotFoundError);
  });
});

describe('LogMealService.log (UC-08/09)', () => {
  it('TC-LOG-001 records the log, closes the meal and marks its foods tried', async () => {
    const t = await lunchWithFirstTry();
    const result = await t.logMeals.log(USER, t.lunch.id, {
      loggedAt: NOON,
      amount: 'half',
      liking: 3,
    });
    expect(result).toEqual({
      log: {
        id: expect.any(String),
        mealId: t.lunch.id,
        loggedAt: NOON,
        loggedBy: USER,
        amount: 'half',
        liking: 3,
        outcome: 'eaten',
        reaction: null,
      },
      pausedIngredients: [],
    });
    expect(t.plans.rows.get(t.lunch.id)!.status).toBe('eaten');
    expect(t.logs.logs[0]!.actorId).toBe(USER);
    expect(await t.history.tried(CHILD)).toContain('ing_bi');
    expect(t.pauses.rows).toEqual([]);
    expect(t.uow.runs).toBe(1);
  });

  it('TC-LOG-002 "Không ăn" refuses the meal and leaves the foods untried', async () => {
    const t = await lunchWithFirstTry();
    const { log } = await t.logMeals.log(USER, t.lunch.id, {
      loggedAt: NOON,
      amount: 'none',
      liking: 1,
    });
    expect(log.outcome).toBe('refused');
    expect(t.plans.rows.get(t.lunch.id)!.status).toBe('refused');
    expect(t.logs.exposures).toEqual([]);
  });

  it('TC-LOG-009 / TC-LOG-015 a reaction pauses the first try and replans upcoming meals with it', async () => {
    const t = await lunchWithFirstTry();
    expect(usesFood(t, 'ing_bi').length).toBeGreaterThan(0);
    const result = await t.logMeals.log(USER, t.lunch.id, {
      loggedAt: NOON,
      amount: 'quarter',
      liking: 2,
      reaction: { symptoms: ['rash'], severity: 'mild', note: 'Nổi mẩn quanh miệng' },
    });
    expect(result.pausedIngredients).toEqual([{ id: 'ing_bi', name: 'Rau 0' }]);
    expect(t.pauses.rows).toMatchObject([
      { childId: CHILD, ingredientId: 'ing_bi', reason: 'reaction', sourceLogId: result.log.id },
    ]);
    expect(usesFood(t, 'ing_bi')).toEqual([]);
    expect(await t.history.tried(CHILD)).not.toContain('ing_bi');
    const library = await t.library.search(USER, CHILD, { q: 'Rau 0' });
    expect(library.dishes).toEqual([]);
    expect(library.hidden.byReason.paused).toBeGreaterThan(0);
  });

  it('TC-LOG-010 pauses the allergen when nothing in the meal was new', async () => {
    const t = await lunchWithFirstTry();
    t.history.triedIds.add('ing_bi');
    const result = await t.logMeals.log(USER, t.lunch.id, {
      loggedAt: NOON,
      amount: 'half',
      liking: 3,
      reaction: { symptoms: ['vomit'], severity: 'unknown' },
    });
    expect(result.pausedIngredients).toEqual([{ id: 'ing_ca', name: 'Cá' }]);
  });

  it('TC-LOG-011 pauses nothing after a meal without new or allergenic foods', async () => {
    const t = await lunchWithFirstTry();
    t.plans.put(changedMeal(t.lunch, { dishId: 'dish_ga_0', newIngredientIds: [] }));
    const result = await t.logMeals.log(USER, t.lunch.id, {
      loggedAt: NOON,
      amount: 'half',
      liking: 3,
      reaction: { symptoms: ['fussy'], severity: 'mild' },
    });
    expect(result.pausedIngredients).toEqual([]);
    expect(t.events.published).toEqual([]);
  });

  it('TC-LOG-012 a food already paused is reported, not paused twice', async () => {
    const t = await lunchWithFirstTry();
    await t.pauseService.pause({
      userId: USER,
      childId: CHILD,
      ingredientIds: ['ing_bi'],
      reason: 'urgent',
    });
    t.events.published.length = 0;
    const result = await t.logMeals.log(USER, t.lunch.id, {
      loggedAt: NOON,
      amount: 'half',
      liking: 3,
      reaction: { symptoms: ['rash'], severity: 'mild' },
    });
    expect(result.pausedIngredients).toEqual([{ id: 'ing_bi', name: 'Rau 0' }]);
    expect(t.pauses.rows).toHaveLength(1);
    expect(t.events.published).toEqual([]);
  });

  it('TC-LOG-013 a failure while replanning rolls everything back', async () => {
    const t = await lunchWithFirstTry();
    const before = snapshot(t.plans.rows.get(t.lunch.id)!);
    t.regenerate.execute = async () => {
      throw new Error('database down');
    };
    await expect(
      t.logMeals.log(USER, t.lunch.id, {
        loggedAt: NOON,
        amount: 'half',
        liking: 3,
        reaction: { symptoms: ['rash'], severity: 'mild' },
      }),
    ).rejects.toThrow('database down');
    expect(t.logs.logs).toEqual([]);
    expect(t.logs.exposures).toEqual([]);
    expect(t.pauses.rows).toEqual([]);
    expect(snapshot(t.plans.rows.get(t.lunch.id)!)).toEqual(before);
  });

  it('TC-LOG-004 / TC-FAM-020 refuses a second log, saying who logged it and when', async () => {
    const t = await lunchWithFirstTry();
    t.logs.names.set(USER, 'Ba');
    await t.logMeals.log(USER, t.lunch.id, { loggedAt: NOON, amount: 'half', liking: 3 });
    const error = await t.logMeals
      .log(USER, t.lunch.id, { loggedAt: NOON, amount: 'all', liking: 5 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MealLoggedTwiceError);
    expect((error as MealLoggedTwiceError).details).toEqual({
      loggedBy: 'Ba',
      loggedAt: NOON.toISOString(),
    });
    expect((await t.logMeals.form(USER, t.lunch.id)).log!.loggedBy).toBe('Ba');
  });

  it('TC-FAM-019 a log by a deleted account has no name', async () => {
    const t = await lunchWithFirstTry();
    await t.logMeals.log(USER, t.lunch.id, { loggedAt: NOON, amount: 'half', liking: 3 });
    t.logs.logs = t.logs.logs.map((l) => MealLog.restore({ ...snapshotLog(l), actorId: null }));
    expect((await t.logMeals.form(USER, t.lunch.id)).log!.loggedBy).toBeNull();
  });

  it('MEAL_ALREADY_LOGGED without details when the meal is closed but its log is missing', () => {
    expect(new MealLoggedTwiceError().details).toBeUndefined();
  });

  it('TC-LOG-005 when another request stored its log first, nothing of this one is kept', async () => {
    const t = await lunchWithFirstTry();
    // Both requests read the meal as planned; the other one commits its log first.
    const add = t.logs.add.bind(t.logs);
    t.logs.add = async (log) => {
      await add(log);
      throw new MealLoggedTwiceError();
    };
    await expect(
      t.logMeals.log(USER, t.lunch.id, { loggedAt: NOON, amount: 'half', liking: 3 }),
    ).rejects.toThrow(MealLoggedTwiceError);
    expect(t.logs.logs).toEqual([]);
    expect(t.plans.rows.get(t.lunch.id)!.status).toBe('planned');
  });

  it('passes on what the domain refuses, before writing anything', async () => {
    const t = await lunchWithFirstTry();
    await expect(
      t.logMeals.log(USER, t.lunch.id, {
        loggedAt: NOON,
        amount: 'half',
        liking: 3,
        reaction: { symptoms: [], severity: 'severe' },
      }),
    ).rejects.toThrow(ReactionWithoutSymptomError);
    expect(t.uow.runs).toBe(0);
  });

  it('TC-LOG-014 refuses another family’s meal', async () => {
    const t = await lunchWithFirstTry();
    await expect(
      t.logMeals.log('u-2', t.lunch.id, { loggedAt: NOON, amount: 'half', liking: 3 }),
    ).rejects.toThrow(LogMealNotFoundError);
  });
});
