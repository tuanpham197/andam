import {
  CHILD,
  USER,
  changedMeal,
  planningTestbed,
} from '../../../../../test/fakes/meal-planning.js';
import { PlanChildNotFoundError } from '../../domain/errors.js';

describe('FoodProgressService (UC-26)', () => {
  it('reads the child’s foods and the first tries planned ahead, skipping logged meals', async () => {
    const t = planningTestbed();
    await t.dayPlans.getDay(USER, CHILD, '2026-09-25');
    const [first, second] = [...t.plans.rows.values()];
    t.plans.put(changedMeal(first!, { newIngredientIds: ['ing_ga'] }));
    t.plans.put(changedMeal(second!, { newIngredientIds: ['ing_bo'], status: 'eaten' }));
    t.history.triedIds = new Set(['ing_ca']);
    t.history.pausedIds = new Set(['ing_le']);
    t.children.rows.get(CHILD)!.info.avoidAllergens = ['egg'];

    const result = await t.foods.get(USER, CHILD);
    const items = new Map(result.groups.flatMap((g) => g.items.map((i) => [i.id, i])));
    expect(items.get('ing_ca')!.status).toBe('tried');
    expect(items.get('ing_le')!.status).toBe('paused');
    expect(items.get('ing_trung')!.status).toBe('avoided');
    expect(items.get('ing_ga')!.upcomingOn).toBe('2026-09-25');
    expect(items.get('ing_bo')!.upcomingOn).toBeNull();
  });

  it('hides another family’s child', async () => {
    const t = planningTestbed();
    await expect(t.foods.get('u-2', CHILD)).rejects.toThrow(PlanChildNotFoundError);
  });
});
