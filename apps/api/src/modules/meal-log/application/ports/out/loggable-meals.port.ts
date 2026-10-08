import type { LoggableMeal, MealOutcome } from '../../../domain/model.js';

export const LOGGABLE_MEALS = Symbol('LOGGABLE_MEALS');

/** Planned meals live in the planning module; logging reads and closes them through this port. */
export interface LoggableMeals {
  find(userId: string, mealId: string): Promise<LoggableMeal | null>;
  /** Throws MEAL_ALREADY_LOGGED when someone else closed the meal first. */
  markLogged(userId: string, mealId: string, outcome: MealOutcome): Promise<void>;
}
