import type { LocalDate } from '../../../shared/kernel/local-date.js';

export const EAT_AMOUNTS = ['none', 'few_spoons', 'quarter', 'half', 'almost_all', 'all'] as const;
export type EatAmount = (typeof EAT_AMOUNTS)[number];

export const SYMPTOMS = ['rash', 'vomit', 'diarrhea', 'swelling', 'breathing', 'fussy'] as const;
export type Symptom = (typeof SYMPTOMS)[number];

export const SEVERITIES = ['unknown', 'mild', 'moderate', 'severe'] as const;
export type Severity = (typeof SEVERITIES)[number];

export type MealOutcome = 'eaten' | 'refused';

/** The planned meal being logged, as the planning module describes it. */
export interface LoggableMeal {
  id: string;
  childId: string;
  date: LocalDate;
  slot: string;
  time: string;
  status: 'planned' | 'prepared' | 'eaten' | 'refused' | 'skipped';
  dish: { id: string; name: string; custom: boolean };
  ingredients: { id: string; name: string; allergenTags: string[] }[];
  /** Foods of this meal the child had never eaten before it (the "Lần đầu thử" ones). */
  firstTryIds: string[];
}
