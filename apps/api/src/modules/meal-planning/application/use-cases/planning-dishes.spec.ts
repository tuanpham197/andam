import { CHILD, USER, planningTestbed } from '../../../../../test/fakes/meal-planning.js';

describe('PlanningDishes', () => {
  it('offers the catalog plus the child’s own dishes, deleted ones flagged', async () => {
    const t = planningTestbed();
    const { id } = await t.customDishes.create(USER, CHILD, {
      name: 'Sinh tố chuối',
      mealType: 'snack',
      ingredients: [{ id: 'ing_chuoi' }],
      prepMin: 5,
      cookMin: 0,
      steps: [],
    });
    t.customs.rows.push({ ...t.customs.rows[0]!, id: 'custom_other', childId: 'c-2' });
    const dishes = await t.dishes.forChild(CHILD);
    expect(dishes).toHaveLength(t.catalog.data.dishes.length + 1);
    expect(dishes.at(-1)).toMatchObject({ id, custom: true, archived: false, mealType: 'snack' });
    expect(dishes.at(-1)!.variants[1]!.portionText).toBe('60–80 ml');
  });

  it('reads a catalog recipe from the catalog and a custom one from the child’s dishes', async () => {
    const t = planningTestbed();
    expect((await t.dishes.recipe(CHILD, 'dish_ga_0'))!.dish.id).toBe('dish_ga_0');
    expect(await t.dishes.recipe(CHILD, 'custom_nope')).toBeNull();
    expect(await t.dishes.recipe(CHILD, 'dish_nope')).toBeNull();
  });
});
