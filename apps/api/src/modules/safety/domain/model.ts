export type PauseReason = 'reaction' | 'urgent';

/** A meal as the safety rules need it: its foods and which of them were tried for the first time. */
export interface SafetyMeal {
  id: string;
  childId: string;
  ingredients: { id: string; allergenTags: string[] }[];
  firstTryIds: string[];
}
