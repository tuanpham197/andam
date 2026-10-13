import { CHILD, USER, planningTestbed } from '../../../../../test/fakes/meal-planning.js';
import {
  ChildNotPlannableError,
  DateOutOfRangeError,
  DishNotForSlotError,
  DishNotFoundError,
  DishNotSafeError,
  InvalidDateError,
  NoSafeDishError,
  PlanChildNotFoundError,
  SlotNotInPlanError,
  SlotTakenError,
} from '../../domain/errors.js';

const TODAY = '2026-09-24';
const TOMORROW = '2026-09-25';

/** Only the banana snack is safe: tomorrow's snack is left empty by the 3-day window. */
async function emptySnackTomorrow() {
  const t = planningTestbed();
  t.children.rows.get(CHILD)!.info.avoidIngredients = ['ing_le', 'ing_bo_qua', 'ing_tao'];
  await t.dayPlans.getDay(USER, CHILD, TODAY);
  const day = await t.dayPlans.getDay(USER, CHILD, TOMORROW);
  expect(day.unfilledSlots.map((s) => s.slot)).toEqual(['afternoon_snack']);
  return t;
}

describe('FillSlotService (UC-24, BR-90..92)', () => {
  it('TC-UX-001 fills an empty slot with a dish from another day, marked manual', async () => {
    const t = await emptySnackTomorrow();
    const meal = await t.fills.fill(USER, CHILD, TOMORROW, 'afternoon_snack');
    expect(meal).toMatchObject({
      slot: 'afternoon_snack',
      time: '15:00',
      source: 'manual',
      dish: { id: 'dish_snack_chuoi' },
    });
    expect((await t.dayPlans.getDay(USER, CHILD, TOMORROW)).unfilledSlots).toEqual([]);
  });

  it('TC-UX-002 never relaxes the hard filter: nothing safe, nothing stored', async () => {
    const t = await emptySnackTomorrow();
    t.children.rows.get(CHILD)!.info.avoidIngredients = [
      'ing_chuoi',
      'ing_le',
      'ing_bo_qua',
      'ing_tao',
    ];
    const before = t.plans.rows.size;
    await expect(t.fills.fill(USER, CHILD, TOMORROW, 'afternoon_snack')).rejects.toThrow(
      NoSafeDishError,
    );
    expect(t.plans.rows.size).toBe(before);
  });

  it('TC-UX-003 refuses a taken slot, a slot not in the day, a date out of range', async () => {
    const t = await emptySnackTomorrow();
    await expect(t.fills.fill(USER, CHILD, TOMORROW, 'lunch')).rejects.toThrow(SlotTakenError);
    await expect(t.fills.fill(USER, CHILD, TOMORROW, 'morning_snack')).rejects.toThrow(
      SlotNotInPlanError,
    );
    await expect(t.fills.fill(USER, CHILD, '2026-09-23', 'lunch')).rejects.toThrow(
      DateOutOfRangeError,
    );
    await expect(t.fills.fill(USER, CHILD, '2026-10-08', 'lunch')).rejects.toThrow(
      DateOutOfRangeError,
    );
    await expect(t.fills.fill(USER, CHILD, '2026-02-30', 'lunch')).rejects.toThrow(
      InvalidDateError,
    );
  });

  it('TC-UX-004 places a dish the parent chose, checked like a swap', async () => {
    const t = await emptySnackTomorrow();
    await expect(
      t.fills.fill(USER, CHILD, TOMORROW, 'afternoon_snack', 'dish_snack_le'),
    ).rejects.toThrow(DishNotSafeError);
    await expect(
      t.fills.fill(USER, CHILD, TOMORROW, 'afternoon_snack', 'dish_ga_0'),
    ).rejects.toThrow(DishNotForSlotError);
    await expect(
      t.fills.fill(USER, CHILD, TOMORROW, 'afternoon_snack', 'dish_unknown'),
    ).rejects.toThrow(DishNotFoundError);
    const meal = await t.fills.fill(USER, CHILD, TOMORROW, 'afternoon_snack', 'dish_snack_chuoi');
    expect(meal).toMatchObject({ source: 'manual', reasons: [] });
  });

  it('TC-UX-005 a filled meal stays through a full re-plan, unless it becomes unsafe', async () => {
    const t = await emptySnackTomorrow();
    const meal = await t.fills.fill(USER, CHILD, TOMORROW, 'afternoon_snack');
    await t.regenerate.execute({ childId: CHILD, userId: USER, cause: 'profile' });
    expect(t.plans.rows.get(meal.id)?.dishId).toBe('dish_snack_chuoi');

    t.children.rows.get(CHILD)!.info.avoidIngredients = ['ing_chuoi'];
    await t.regenerate.execute({ childId: CHILD, userId: USER, cause: 'profile' });
    expect(t.plans.rows.has(meal.id)).toBe(false);
  });

  it('TC-UX-006 a sick day still gets no first try', async () => {
    const t = await emptySnackTomorrow();
    t.history.healthOn.set(TOMORROW, 'sick');
    t.history.triedIds.delete('ing_chuoi');
    await expect(t.fills.fill(USER, CHILD, TOMORROW, 'afternoon_snack')).rejects.toThrow(
      NoSafeDishError,
    );
  });

  it('reports a slot filled by someone else meanwhile', async () => {
    const t = await emptySnackTomorrow();
    const add = t.plans.addMany.bind(t.plans);
    t.plans.addMany = async () => false;
    await expect(t.fills.fill(USER, CHILD, TOMORROW, 'afternoon_snack')).rejects.toThrow(
      SlotTakenError,
    );
    t.plans.addMany = add;
  });

  it('hides another family’s child and refuses a child outside the planning age', async () => {
    const t = planningTestbed();
    await expect(t.fills.fill('u-2', CHILD, TOMORROW, 'lunch')).rejects.toThrow(
      PlanChildNotFoundError,
    );
    t.children.rows.get(CHILD)!.info.stage = null;
    await expect(t.fills.fill(USER, CHILD, TOMORROW, 'lunch')).rejects.toThrow(
      ChildNotPlannableError,
    );
  });
});
