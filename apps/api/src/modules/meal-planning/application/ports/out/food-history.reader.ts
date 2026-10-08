import type { LocalDate } from '../../../../../shared/kernel/local-date.js';
import type { DishFeedback, HealthState } from '../../../domain/model.js';

export const FOOD_HISTORY_READER = Symbol('FOOD_HISTORY_READER');

/** What the child ate, liked, reacted to and how they feel — fed by later phases (P5, P6). */
export interface FoodHistoryReader {
  tried(childId: string): Promise<Set<string>>;
  paused(childId: string): Promise<Set<string>>;
  feedback(childId: string): Promise<Map<string, DishFeedback>>;
  /** Days a new allergenic food was eaten (planned introductions are read from the plan). */
  allergenIntroductions(childId: string, from: LocalDate, to: LocalDate): Promise<LocalDate[]>;
  /** Health status the menu follows on `date` (BR-50..53). */
  health(childId: string, date: LocalDate): Promise<HealthState>;
  /** FR-118: who logged each of these meals and when (name null: account deleted). */
  loggedBy(mealIds: string[]): Promise<Map<string, { name: string | null; at: Date }>>;
}
