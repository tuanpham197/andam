import { careTestbed } from '../../../../../test/fakes/care.js';
import { CHILD, USER, changedMeal } from '../../../../../test/fakes/meal-planning.js';
import {
  SafetyChildNotFoundError,
  SafetyMealNotFoundError,
  UrgentEventNotFoundError,
} from '../../domain/errors.js';

async function withLunch() {
  const t = careTestbed();
  await t.dayPlans.getDay(USER, CHILD, '2026-09-24');
  const lunch = [...t.plans.rows.values()].find((m) => m.slot === 'lunch')!;
  // Fish porridge with pumpkin ("Rau 0") tried for the first time.
  t.plans.put(changedMeal(lunch, { dishId: 'dish_ca_0', newIngredientIds: ['ing_bi'] }));
  t.history.triedIds.delete('ing_bi');
  return { ...t, lunch };
}

describe('UrgentService (UC-10)', () => {
  it('TC-URG-001 records the event and pauses the first tries and allergens of the meal', async () => {
    const t = await withLunch();
    const view = await t.urgent.open(USER, CHILD, t.lunch.id);
    expect(view).toEqual({
      id: expect.any(String),
      mealId: t.lunch.id,
      openedAt: t.clock.now(),
      contactedMedicalAt: null,
      pausedIngredients: [
        { id: 'ing_bi', name: 'Rau 0' },
        { id: 'ing_ca', name: 'Cá' },
      ],
    });
    expect(t.urgents.rows[0]).toMatchObject({ childId: CHILD, actorId: USER });
    expect(t.pauses.rows.map((p) => [p.ingredientId, p.reason, p.sourceUrgentId])).toEqual([
      ['ing_bi', 'urgent', view.id],
      ['ing_ca', 'urgent', view.id],
    ]);
  });

  it('keeps the meal being eaten (not yet due) while replanning the other upcoming meals', async () => {
    const t = await withLunch();
    await t.dayPlans.getDay(USER, CHILD, '2026-09-25');
    const usesPumpkin = () =>
      [...t.plans.rows.values()].filter(
        (m) =>
          m.id !== t.lunch.id &&
          m.isPending &&
          (m.date > '2026-09-24' || m.time > '09:00') &&
          t.catalog.data.dishes.find((d) => d.id === m.dishId)!.ingredientIds.includes('ing_bi'),
      );
    expect(usesPumpkin().length).toBeGreaterThan(0);
    // 09:00: lunch (11:00) is still ahead, yet it is the meal the child is reacting to.
    await t.urgent.open(USER, CHILD, t.lunch.id);
    expect(t.plans.rows.get(t.lunch.id)).toMatchObject({ dishId: 'dish_ca_0' });
    expect(usesPumpkin()).toEqual([]);
  });

  it('TC-URG-002 without a meal records the event and pauses nothing', async () => {
    const t = await withLunch();
    const view = await t.urgent.open(USER, CHILD, null);
    expect(view).toMatchObject({ mealId: null, pausedIngredients: [] });
    expect(t.pauses.rows).toEqual([]);
  });

  it('TC-URG-003 opening twice records two events without pausing twice', async () => {
    const t = await withLunch();
    await t.urgent.open(USER, CHILD, t.lunch.id);
    const again = await t.urgent.open(USER, CHILD, t.lunch.id);
    expect(t.urgents.rows).toHaveLength(2);
    expect(t.pauses.rows).toHaveLength(2);
    expect(again.pausedIngredients).toHaveLength(2);
  });

  it('refuses a meal of another child and another family’s child', async () => {
    const t = await withLunch();
    t.children.rows.set('c-2', {
      userId: USER,
      info: { ...t.children.rows.get(CHILD)!.info, childId: 'c-2' },
    });
    await expect(t.urgent.open(USER, 'c-2', t.lunch.id)).rejects.toThrow(SafetyMealNotFoundError);
    await expect(t.urgent.open(USER, CHILD, 'nope')).rejects.toThrow(SafetyMealNotFoundError);
    await expect(t.urgent.open('u-2', CHILD, null)).rejects.toThrow(SafetyChildNotFoundError);
  });

  it('TC-URG-004 keeps the first "đã liên hệ y tế" time', async () => {
    const t = await withLunch();
    const { id } = await t.urgent.open(USER, CHILD, null);
    const first = t.clock.now();
    await t.urgent.markContactedMedical(USER, id);
    t.clock.advance(60_000);
    const view = await t.urgent.markContactedMedical(USER, id);
    expect(view.contactedMedicalAt).toEqual(first);
    expect(view.pausedIngredients).toEqual([]);
  });

  it('answers URGENT_EVENT_NOT_FOUND for an unknown or another family’s event', async () => {
    const t = await withLunch();
    const { id } = await t.urgent.open(USER, CHILD, null);
    await expect(t.urgent.markContactedMedical(USER, 'nope')).rejects.toThrow(
      UrgentEventNotFoundError,
    );
    await expect(t.urgent.markContactedMedical('u-2', id)).rejects.toThrow(
      UrgentEventNotFoundError,
    );
  });
});
