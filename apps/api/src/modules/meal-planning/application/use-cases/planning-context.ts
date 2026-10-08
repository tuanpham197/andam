import { addDays, type LocalDate } from '../../../../shared/kernel/local-date.js';
import type { StageSchedule } from '../../domain/menu-engine.js';
import type {
  MealSlot,
  MealUse,
  PlanDish,
  PlanIngredient,
  PlanningContext,
  ProteinSource,
  StageId,
  Texture,
} from '../../domain/model.js';
import type { MealStatus, PlannedMeal } from '../../domain/planned-meal.js';
import type { ChildPlanningInfo } from '../ports/out/child-planning.reader.js';
import type { FoodHistoryReader } from '../ports/out/food-history.reader.js';
import type { PlanningDishes } from './planning-dishes.js';

const VIEW_GROUPS = ['carb', 'protein', 'fat', 'veg'] as const;
export type ViewGroup = (typeof VIEW_GROUPS)[number];

/** The 4 food groups a dish covers, fruit counting as vegetables (FR-023). */
export function foodGroupsOf(
  ingredientIds: string[],
  ingredients: ReadonlyMap<string, PlanIngredient>,
): ViewGroup[] {
  const groups = new Set(
    ingredientIds.map((id) => {
      const group = ingredients.get(id)?.foodGroup;
      return group === 'fruit' ? 'veg' : group;
    }),
  );
  return VIEW_GROUPS.filter((g) => groups.has(g));
}

export async function loadPlanningContext(
  catalog: PlanningDishes,
  history: FoodHistoryReader,
  child: ChildPlanningInfo,
  stage: StageId,
  date: LocalDate,
): Promise<{ ctx: PlanningContext; schedule: StageSchedule }> {
  const [dishes, ingredients, schedule, tried, paused, feedback, health] = await Promise.all([
    catalog.forChild(child.childId),
    catalog.ingredients(),
    catalog.schedule(stage),
    history.tried(child.childId),
    history.paused(child.childId),
    history.feedback(child.childId),
    history.health(child.childId, date),
  ]);
  return {
    schedule,
    ctx: {
      childId: child.childId,
      ageMonths: child.ageMonths,
      stage,
      health,
      avoidAllergens: new Set(child.avoidAllergens),
      avoidIngredients: new Set(child.avoidIngredients),
      paused,
      tried,
      ingredients: new Map(ingredients.map((i) => [i.id, i])),
      dishes,
      feedback,
    },
  };
}

export const toUse = (meal: PlannedMeal): MealUse => ({
  date: meal.date,
  slot: meal.slot,
  dishId: meal.dishId,
});

/** BR-25: eaten introductions plus new allergenic foods planned in the 2 days before `date`. */
export async function allergenIntroductionsBefore(
  history: FoodHistoryReader,
  ctx: PlanningContext,
  date: LocalDate,
  around: PlannedMeal[],
): Promise<LocalDate[]> {
  const from = addDays(date, -2);
  const eaten = await history.allergenIntroductions(ctx.childId, from, date);
  const planned = around
    .filter((m) => m.date >= from && m.date < date)
    .filter((m) =>
      m.newIngredientIds.some(
        (id) => (ctx.ingredients.get(id)?.allergenTags.length ?? 0) > 0 && !ctx.tried.has(id),
      ),
    )
    .map((m) => m.date);
  return [...eaten, ...planned];
}

export const dishMap = (dishes: readonly PlanDish[]) => new Map(dishes.map((d) => [d.id, d]));

export interface MealView {
  id: string;
  slot: MealSlot;
  time: string;
  status: MealStatus;
  texture: Texture;
  portionText: string;
  dish: {
    id: string;
    name: string;
    prepMin: number;
    cookMin: number;
    mainProtein: ProteinSource | null;
    foodGroups: ViewGroup[];
    custom: boolean;
  };
  newIngredients: { id: string; name: string }[];
  /** FR-118: who logged the meal, for the other members (null while not logged). */
  loggedBy: { name: string | null; at: Date } | null;
}

/** A dish as the meal screens show it: timing, protein and the food groups it covers. */
export function dishSummary(dish: PlanDish, ingredients: ReadonlyMap<string, PlanIngredient>) {
  return {
    id: dish.id,
    name: dish.name,
    prepMin: dish.prepMin,
    cookMin: dish.cookMin,
    mainProtein: dish.mainProtein,
    foodGroups: foodGroupsOf(dish.ingredientIds, ingredients),
    custom: dish.custom === true,
  };
}

export const namedIngredients = (ids: string[], ingredients: ReadonlyMap<string, PlanIngredient>) =>
  ids.map((id) => ({ id, name: ingredients.get(id)?.name ?? id }));

export function toMealView(
  meal: PlannedMeal,
  dishes: ReadonlyMap<string, PlanDish>,
  ingredients: ReadonlyMap<string, PlanIngredient>,
  loggedBy: MealView['loggedBy'] = null,
): MealView {
  return {
    id: meal.id,
    slot: meal.slot,
    time: meal.time,
    status: meal.status,
    texture: meal.texture,
    portionText: meal.portionText,
    dish: dishSummary(dishes.get(meal.dishId)!, ingredients),
    newIngredients: namedIngredients(meal.newIngredientIds, ingredients),
    loggedBy,
  };
}
