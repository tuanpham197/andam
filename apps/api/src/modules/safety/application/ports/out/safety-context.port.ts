import type { SafetyMeal } from '../../../domain/model.js';

export const SAFETY_CONTEXT = Symbol('SAFETY_CONTEXT');

/** What the safety rules read from other modules, always on behalf of the signed-in parent. */
export interface SafetyContext {
  /** Owner or caregiver (BR-73); null when the user is not a member of the child. */
  roleOf(userId: string, childId: string): Promise<'owner' | 'caregiver' | null>;
  meal(userId: string, mealId: string): Promise<SafetyMeal | null>;
  ingredientNames(ids: string[]): Promise<Map<string, string>>;
}
