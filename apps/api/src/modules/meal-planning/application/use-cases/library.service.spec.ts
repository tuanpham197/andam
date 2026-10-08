import { CHILD, USER, planningTestbed, snapshot } from '../../../../../test/fakes/meal-planning.js';
import { ChildNotPlannableError, PlanChildNotFoundError } from '../../domain/errors.js';
import { PlannedMeal } from '../../domain/planned-meal.js';

const TODAY = '2026-09-24';

describe('LibraryService (UC-07)', () => {
  it('lists the safe dishes with what the cards show', async () => {
    const t = planningTestbed();
    const view = await t.library.search(USER, CHILD, {});
    expect(view.dishes).toHaveLength(t.catalog.data.dishes.length);
    const ga = view.dishes.find((d) => d.id === 'dish_ga_0')!;
    expect(ga).toEqual({
      id: 'dish_ga_0',
      name: 'Cháo ing_ga 0',
      prepMin: 5,
      cookMin: 15,
      mainProtein: 'chicken',
      foodGroups: ['carb', 'protein', 'fat', 'veg'],
      custom: false,
      mealType: 'main',
      texture: 'lumpy',
      newIngredients: [],
      liked: false,
      lastEaten: null,
    });
    expect(view.hidden).toMatchObject({ total: 0, items: [] });
  });

  it('names hidden dishes and the reason (FR-050)', async () => {
    const t = planningTestbed();
    t.children.rows.get(CHILD)!.info.avoidAllergens = ['egg'];
    const view = await t.library.search(USER, CHILD, { chip: 'all' });
    expect(view.hidden.total).toBe(3);
    expect(view.hidden.items).toContainEqual({
      dishId: 'dish_trung_0',
      name: 'Cháo ing_trung 0',
      reason: 'allergen',
    });
  });

  it('passes the search, chip and fresh filter through', async () => {
    const t = planningTestbed();
    const view = await t.library.search(USER, CHILD, { q: 'snack', chip: 'snack', fresh: true });
    expect(view.dishes.map((d) => d.id).every((id) => id.startsWith('dish_snack'))).toBe(true);
  });

  it('counts only meals actually eaten in the last 7 days as recent', async () => {
    const t = planningTestbed();
    await t.dayPlans.getDay(USER, CHILD, TODAY);
    const [breakfast, lunch] = [...t.plans.rows.values()].sort((a, b) =>
      a.time.localeCompare(b.time),
    );
    t.plans.put(PlannedMeal.restore({ ...snapshot(breakfast!), status: 'eaten' }));
    t.plans.put(
      PlannedMeal.restore({
        ...snapshot(lunch!),
        id: 'm-old',
        date: '2026-09-16',
        slot: 'lunch',
        status: 'eaten',
      }),
    );
    const view = await t.library.search(USER, CHILD, {});
    const tag = (id: string) => view.dishes.find((d) => d.id === id)!.lastEaten;
    expect(tag(breakfast!.dishId)).toEqual({ daysAgo: 0, slot: 'breakfast' });
    // Planned but not eaten yet: not "recent".
    expect(tag(lunch!.dishId)).toBeNull();
  });

  it('answers CHILD_NOT_FOUND for another family’s child', async () => {
    const t = planningTestbed();
    await expect(t.library.search('u-2', CHILD, {})).rejects.toThrow(PlanChildNotFoundError);
  });

  it('refuses a child outside 6–24 months: nothing can be judged safe for them', async () => {
    const t = planningTestbed();
    t.children.rows.get(CHILD)!.info.stage = null;
    await expect(t.library.search(USER, CHILD, {})).rejects.toThrow(ChildNotPlannableError);
  });
});
