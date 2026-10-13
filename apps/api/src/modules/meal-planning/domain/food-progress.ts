import type { LocalDate } from '../../../shared/kernel/local-date.js';
import type { Allergen, PlanIngredient } from './model.js';
import { TRACKED_GROUPS } from './novelty.js';

export type TrackedGroup = (typeof TRACKED_GROUPS)[number];
export type FoodStatus = 'avoided' | 'paused' | 'not_yet' | 'tried' | 'new';

export interface FoodProgressInput {
  ageMonths: number;
  ingredients: readonly PlanIngredient[];
  avoidAllergens: ReadonlySet<Allergen>;
  avoidIngredients: ReadonlySet<string>;
  tried: ReadonlySet<string>;
  paused: ReadonlySet<string>;
  /** First tries of meals not logged yet, from today on (BR-96). */
  upcoming: readonly { date: LocalDate; newIngredientIds: readonly string[] }[];
}

export interface FoodItem {
  id: string;
  name: string;
  status: FoodStatus;
  minAgeMonths: number;
  /** The nearest day the food is planned as a first try. */
  upcomingOn: LocalDate | null;
}

export interface FoodProgress {
  summary: { tried: number; total: number; paused: number; avoided: number; notYet: number };
  groups: { group: TrackedGroup; items: FoodItem[] }[];
}

/**
 * UC-26: where the child stands with the foods that count as first tries (BR-96). The progress
 * leaves out foods the profile avoids and foods not yet suitable for the age.
 */
export function foodProgress(input: FoodProgressInput): FoodProgress {
  const nextTry = new Map<string, LocalDate>();
  for (const meal of input.upcoming)
    for (const id of meal.newIngredientIds) {
      const known = nextTry.get(id);
      if (known === undefined || meal.date < known) nextTry.set(id, meal.date);
    }

  const statusOf = (food: PlanIngredient): FoodStatus => {
    if (
      input.avoidIngredients.has(food.id) ||
      food.allergenTags.some((tag) => input.avoidAllergens.has(tag))
    )
      return 'avoided';
    if (input.paused.has(food.id)) return 'paused';
    if (food.minAgeMonths > input.ageMonths) return 'not_yet';
    return input.tried.has(food.id) ? 'tried' : 'new';
  };

  const items = input.ingredients
    .filter((food) => (TRACKED_GROUPS as readonly string[]).includes(food.foodGroup))
    .map((food) => {
      const status = statusOf(food);
      return {
        group: food.foodGroup as TrackedGroup,
        item: {
          id: food.id,
          name: food.name,
          status,
          minAgeMonths: food.minAgeMonths,
          upcomingOn: status === 'new' ? (nextTry.get(food.id) ?? null) : null,
        },
      };
    });
  const count = (status: FoodStatus) => items.filter((i) => i.item.status === status).length;
  const avoided = count('avoided');
  const notYet = count('not_yet');

  return {
    summary: {
      tried: count('tried'),
      total: items.length - avoided - notYet,
      paused: count('paused'),
      avoided,
      notYet,
    },
    groups: TRACKED_GROUPS.map((group) => ({
      group,
      items: items
        .filter((i) => i.group === group)
        .map((i) => i.item)
        .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    })),
  };
}
