import type { MealUse, PlanDish, PlanningContext, ProteinSource } from './model.js';

/** Display order of the protein rotation chart (design S04). */
export const PROTEIN_ORDER: readonly ProteinSource[] = [
  'fish',
  'chicken',
  'beef',
  'pork',
  'legume',
  'egg',
];
const FOUR_GROUPS = ['carb', 'protein', 'fat', 'veg'] as const;

export interface WeekStats {
  /** BR-60: different dishes over every meal of the week (main and snack). */
  distinctDishes: number;
  totalMeals: number;
  /** BR-61: days whose main meals together cover the 4 food groups. */
  daysFullGroups: number;
  /** BR-62: main meals per protein source; an avoided source is shown as such. */
  proteinRotation: { protein: ProteinSource; meals: number; avoided: boolean }[];
}

type StatsContext = Pick<
  PlanningContext,
  'dishes' | 'ingredients' | 'avoidAllergens' | 'avoidIngredients'
>;

/** Food groups (of 4) covered by the main meals of one day, fruit counting as vegetables. */
export function dayGroupsCovered(ctx: StatsContext, dishIds: string[]): number {
  const dishes = new Map(ctx.dishes.map((d) => [d.id, d]));
  const groups = new Set<string>();
  for (const dish of dishIds.map((id) => dishes.get(id)))
    if (dish?.mealType === 'main') {
      for (const id of dish.ingredientIds) {
        const group = ctx.ingredients.get(id)!.foodGroup;
        groups.add(group === 'fruit' ? 'veg' : group);
      }
    }
  return FOUR_GROUPS.filter((g) => groups.has(g)).length;
}

/**
 * A source is avoided when the profile rules out every food of the catalog that provides it
 * (egg allergy → no egg at all), so its 0 is a choice, not a gap (TC-WK-002/003).
 */
function avoidedProteins(ctx: StatsContext): Set<ProteinSource> {
  const avoided = new Set<ProteinSource>();
  for (const protein of PROTEIN_ORDER) {
    const sources = [...ctx.ingredients.values()].filter((i) => i.proteinSource === protein);
    const excluded = (i: (typeof sources)[number]) =>
      ctx.avoidIngredients.has(i.id) || i.allergenTags.some((tag) => ctx.avoidAllergens.has(tag));
    if (sources.length > 0 && sources.every(excluded)) avoided.add(protein);
  }
  return avoided;
}

export function weekStats(ctx: StatsContext, meals: MealUse[]): WeekStats {
  const dishes = new Map<string, PlanDish>(ctx.dishes.map((d) => [d.id, d]));
  const byDate = new Map<string, string[]>();
  for (const meal of meals) byDate.set(meal.date, [...(byDate.get(meal.date) ?? []), meal.dishId]);

  const proteinMeals = new Map<ProteinSource, number>();
  for (const meal of meals) {
    const dish = dishes.get(meal.dishId);
    if (dish?.mealType === 'main' && dish.mainProtein)
      proteinMeals.set(dish.mainProtein, (proteinMeals.get(dish.mainProtein) ?? 0) + 1);
  }
  const avoided = avoidedProteins(ctx);

  return {
    distinctDishes: new Set(meals.map((m) => m.dishId)).size,
    totalMeals: meals.length,
    daysFullGroups: [...byDate.values()].filter((ids) => dayGroupsCovered(ctx, ids) === 4).length,
    proteinRotation: PROTEIN_ORDER.map((protein) => ({
      protein,
      meals: proteinMeals.get(protein) ?? 0,
      avoided: avoided.has(protein),
    })),
  };
}
