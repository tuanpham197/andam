import type { ExposureUpdate, MealLog } from '../../../domain/meal-log.js';

export const MEAL_LOG_REPOSITORY = Symbol('MEAL_LOG_REPOSITORY');

export interface MealLogRepository {
  findByMeal(mealId: string): Promise<MealLog | null>;
  /** FR-118: the name of whoever logged the meal (null when the account is gone), and when. */
  whoLogged(mealId: string): Promise<{ name: string | null; at: Date } | null>;
  /** One log per meal: throws MealLoggedTwiceError when the meal already has one (TC-LOG-005). */
  add(log: MealLog): Promise<void>;
  /** BR-44; a food once tried stays tried. */
  recordExposures(childId: string, updates: ExposureUpdate[]): Promise<void>;
}
