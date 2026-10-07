import type { PlanDish, PlanningContext } from './model.js';

// Staples are not "first tries": only proteins, vegetables and fruit get the new-food caution.
const TRACKED_GROUPS = new Set(['protein', 'veg', 'fruit']);

/** Foods of the dish the child has not eaten yet (shown as "Lần đầu thử"). */
export function newIngredientIds(dish: PlanDish, ctx: PlanningContext): string[] {
  return dish.ingredientIds.filter((id) => {
    const ingredient = ctx.ingredients.get(id);
    return (
      ingredient !== undefined && TRACKED_GROUPS.has(ingredient.foodGroup) && !ctx.tried.has(id)
    );
  });
}

/** New foods that are also common allergens: the ones BR-24/25 restrict. */
export function newAllergenIds(dish: PlanDish, ctx: PlanningContext): string[] {
  return newIngredientIds(dish, ctx).filter(
    (id) => ctx.ingredients.get(id)!.allergenTags.length > 0,
  );
}
