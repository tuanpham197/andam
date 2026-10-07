import type { LocalDate } from '../../../../../shared/kernel/local-date.js';
import type { PlannedMeal } from '../../../domain/planned-meal.js';
import type { SwapEvent } from '../../../domain/swap.js';

export const MEAL_PLAN_REPOSITORY = Symbol('MEAL_PLAN_REPOSITORY');

export interface MealPlanRepository {
  findBetween(childId: string, from: LocalDate, to: LocalDate): Promise<PlannedMeal[]>;
  /** Returns false when another request already stored meals for one of these slots (TC-PLN-001). */
  addMany(meals: PlannedMeal[]): Promise<boolean>;
  /** A meal of a child owned by `userId`, or null. */
  findOwned(mealId: string, userId: string): Promise<PlannedMeal | null>;
  save(meal: PlannedMeal): Promise<void>;
  remove(mealIds: string[]): Promise<void>;
  recordSwap(event: SwapEvent): Promise<void>;
}
