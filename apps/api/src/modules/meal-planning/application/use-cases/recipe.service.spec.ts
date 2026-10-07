import { CHILD, USER, planningTestbed } from '../../../../../test/fakes/meal-planning.js';
import { DishNotFoundError, PlanChildNotFoundError } from '../../domain/errors.js';

describe('RecipeService (UC-05, FR-027..030)', () => {
  it('shows the recipe at the child’s stage with its safety facts', async () => {
    const t = planningTestbed();
    const recipe = await t.recipes.get(USER, CHILD, 'dish_ca_0');
    expect(recipe).toMatchObject({
      id: 'dish_ca_0',
      selectedStage: 2,
      contentVersion: 3,
      reviewedBy: 'Chuyên gia A',
      allergens: ['fish'],
      foodGroups: ['carb', 'protein', 'fat', 'veg'],
      exclusion: null,
      steps: ['Bước 1', 'Bước 2'],
    });
    expect(recipe.variants.map((v) => v.stage)).toEqual([1, 2, 3, 4]);
    expect(recipe.ingredients[1]).toMatchObject({
      ingredientId: 'ing_ca',
      name: 'Cá',
      isNew: false,
      allergenTags: ['fish'],
    });
  });

  it('FR-028 shows another stage when asked, falling back to the child’s stage when unsupported', async () => {
    const t = planningTestbed();
    expect((await t.recipes.get(USER, CHILD, 'dish_ca_0', 3)).selectedStage).toBe(3);
    t.catalog.data.dishes = t.catalog.data.dishes.map((d) =>
      d.id === 'dish_ca_0' ? { ...d, stages: [2, 3] } : d,
    );
    expect((await t.recipes.get(USER, CHILD, 'dish_ca_0', 1)).selectedStage).toBe(2);
  });

  it('falls back to the first supported stage when the child’s stage is not supported', async () => {
    const t = planningTestbed();
    t.catalog.data.dishes = t.catalog.data.dishes.map((d) =>
      d.id === 'dish_ca_0' ? { ...d, stages: [3, 4] } : d,
    );
    expect((await t.recipes.get(USER, CHILD, 'dish_ca_0')).selectedStage).toBe(3);
  });

  it('FR-024 flags ingredients the child has never eaten', async () => {
    const t = planningTestbed();
    t.history.triedIds = new Set(['ing_gao', 'ing_dau_an', 'ing_bi']);
    const recipe = await t.recipes.get(USER, CHILD, 'dish_ca_0');
    expect(recipe.ingredients.filter((i) => i.isNew).map((i) => i.ingredientId)).toEqual([
      'ing_ca',
    ]);
  });

  it('says why a dish is not safe for this child (opened from the library)', async () => {
    const t = planningTestbed();
    t.children.rows.get(CHILD)!.info.avoidAllergens = ['fish'];
    expect((await t.recipes.get(USER, CHILD, 'dish_ca_0')).exclusion).toBe('allergen');
  });

  it('shows the first stage when the child is not plannable yet', async () => {
    const t = planningTestbed();
    t.children.rows.get(CHILD)!.info.stage = null;
    expect((await t.recipes.get(USER, CHILD, 'dish_ca_0')).selectedStage).toBe(1);
  });

  it('answers not found for an unknown dish or someone else’s child', async () => {
    const t = planningTestbed();
    await expect(t.recipes.get(USER, CHILD, 'dish_khong_co')).rejects.toThrow(DishNotFoundError);
    await expect(t.recipes.get('stranger', CHILD, 'dish_ca_0')).rejects.toThrow(
      PlanChildNotFoundError,
    );
  });
});
