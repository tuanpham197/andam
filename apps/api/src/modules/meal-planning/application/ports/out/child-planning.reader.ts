import type { Allergen, StageId } from '../../../domain/model.js';

export const CHILD_PLANNING_READER = Symbol('CHILD_PLANNING_READER');

export interface ChildPlanningInfo {
  childId: string;
  ageMonths: number;
  /** Effective stage, or null when menus are not planned (under 6 / over 24 months). */
  stage: StageId | null;
  avoidAllergens: Allergen[];
  avoidIngredients: string[];
}

export interface ChildPlanningReader {
  find(childId: string, userId: string): Promise<ChildPlanningInfo | null>;
}
