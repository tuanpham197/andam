import { addDays, compareDates, type LocalDate } from '../../../shared/kernel/local-date.js';
import type { PlanDish, PlanningContext } from './model.js';
import { newIngredientIds } from './novelty.js';

/** In priority order: a dish breaking several rules is reported under the first one. */
export const EXCLUSION_REASONS = [
  'allergen',
  'avoid',
  'paused',
  'age',
  'refused',
  'sick_new',
] as const;
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

const REFUSAL_MEMORY_DAYS = 30;

/**
 * Hard safety filter (BR-01..07). Never relaxed, whatever the size of the catalog.
 * Returns why the dish is excluded for this child today, or null when it is safe.
 */
export function exclusionReason(
  dish: PlanDish,
  ctx: PlanningContext,
  today: LocalDate,
): ExclusionReason | null {
  const ingredients = dish.ingredientIds.map((id) => ctx.ingredients.get(id));

  if (ingredients.some((i) => i?.allergenTags.some((tag) => ctx.avoidAllergens.has(tag))))
    return 'allergen';
  if (dish.ingredientIds.some((id) => ctx.avoidIngredients.has(id))) return 'avoid';
  if (dish.ingredientIds.some((id) => ctx.paused.has(id))) return 'paused';
  // An ingredient unknown to the catalog cannot be checked, so it is treated as unsafe.
  if (
    !dish.stages.includes(ctx.stage) ||
    ingredients.some((i) => i === undefined || i.minAgeMonths > ctx.ageMonths)
  ) {
    return 'age';
  }
  const feedback = ctx.feedback.get(dish.id);
  if (
    feedback?.liking === 1 &&
    compareDates(feedback.date, addDays(today, -REFUSAL_MEMORY_DAYS)) >= 0
  ) {
    return 'refused';
  }
  if (ctx.health !== 'normal' && newIngredientIds(dish, ctx).length > 0) return 'sick_new';
  return null;
}

export interface ExclusionSummary {
  total: number;
  byReason: Record<ExclusionReason, number>;
}

export function summarizeExclusions(reasons: (ExclusionReason | null)[]): ExclusionSummary {
  const byReason = Object.fromEntries(EXCLUSION_REASONS.map((r) => [r, 0])) as Record<
    ExclusionReason,
    number
  >;
  let total = 0;
  for (const reason of reasons) {
    if (reason === null) continue;
    byReason[reason] += 1;
    total += 1;
  }
  return { total, byReason };
}
