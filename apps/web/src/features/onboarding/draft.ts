import { useCallback, useState } from 'react';
import type {
  AvoidIngredientDtoReason,
  CreateChildDtoAvoidAllergensItem,
} from '@appandam/api-client';

export interface DraftIngredient {
  ingredientId: string;
  name: string;
  reason: AvoidIngredientDtoReason;
}

export interface OnboardingDraft {
  name: string;
  birthDate: string;
  isPremature: boolean;
  weeksEarly: number;
  avoidAllergens: CreateChildDtoAvoidAllergensItem[];
  avoidIngredients: DraftIngredient[];
  priorReaction: 'never' | 'yes' | 'unsure';
  priorReactionNote: string;
}

export const EMPTY_DRAFT: OnboardingDraft = {
  name: '',
  birthDate: '',
  isPremature: false,
  weeksEarly: 2,
  avoidAllergens: [],
  avoidIngredients: [],
  priorReaction: 'never',
  priorReactionNote: '',
};

const KEY = 'onboarding-draft';

/** sessionStorage keeps the draft through Back and reloads, but not across browser sessions. */
export function loadDraft(): OnboardingDraft {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    return typeof stored === 'object' && stored !== null
      ? { ...EMPTY_DRAFT, ...stored }
      : EMPTY_DRAFT;
  } catch {
    return EMPTY_DRAFT;
  }
}

function saveDraft(draft: OnboardingDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Private mode or full storage: the draft simply lives in memory.
  }
}

export function clearDraft(): void {
  sessionStorage.removeItem(KEY);
}

export function useOnboardingDraft() {
  const [draft, setDraft] = useState(loadDraft);
  const update = useCallback((changes: Partial<OnboardingDraft>) => {
    setDraft((current) => {
      const next = { ...current, ...changes };
      saveDraft(next);
      return next;
    });
  }, []);
  return { draft, update };
}
