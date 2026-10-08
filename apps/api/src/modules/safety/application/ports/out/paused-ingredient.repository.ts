import type { PauseReason } from '../../../domain/model.js';

export const PAUSED_INGREDIENT_REPOSITORY = Symbol('PAUSED_INGREDIENT_REPOSITORY');

export interface NewPause {
  id: string;
  childId: string;
  ingredientId: string;
  reason: PauseReason;
  sourceLogId: string | null;
  sourceUrgentId: string | null;
  pausedAt: Date;
}

/** A food currently paused for a child, with what caused it (G08). */
export interface ActivePause {
  id: string;
  ingredientId: string;
  name: string;
  reason: PauseReason;
  pausedAt: Date;
  /** The meal logged with a reaction, or the meal "Dấu hiệu nguy hiểm" was opened from. */
  meal: { date: string; slot: string; dishName: string } | null;
}

export interface PausedIngredientRepository {
  activeIds(childId: string): Promise<Set<string>>;
  add(pauses: NewPause[]): Promise<void>;
  listActive(childId: string): Promise<ActivePause[]>;
  /** Ends the active pause of this food; false when the food was not paused (BR-42). */
  resume(childId: string, ingredientId: string, at: Date, actorId: string): Promise<boolean>;
}
