import type { SafetyMeal } from './model.js';

interface UrgentEventState {
  id: string;
  childId: string;
  mealId: string | null;
  openedAt: Date;
  contactedMedicalAt: Date | null;
  actorId: string | null;
}

/** UC-10: the parent opened "Dấu hiệu nguy hiểm"; kept in the journal for the doctor. */
export class UrgentEvent {
  private constructor(private readonly state: UrgentEventState) {}

  static open(input: {
    id: string;
    childId: string;
    mealId: string | null;
    openedAt: Date;
    actorId: string;
  }): UrgentEvent {
    return new UrgentEvent({ ...input, contactedMedicalAt: null });
  }

  static restore(state: UrgentEventState): UrgentEvent {
    return new UrgentEvent({ ...state });
  }

  get id() {
    return this.state.id;
  }
  get childId() {
    return this.state.childId;
  }
  get mealId() {
    return this.state.mealId;
  }
  get openedAt() {
    return this.state.openedAt;
  }
  get contactedMedicalAt() {
    return this.state.contactedMedicalAt;
  }
  get actorId() {
    return this.state.actorId;
  }

  /** FR-067: the first time is what the doctor needs; pressing again changes nothing (TC-URG-004). */
  markContactedMedical(now: Date): void {
    this.state.contactedMedicalAt ??= now;
  }
}

/**
 * BR-41: from a meal, pause every food tried for the first time plus every common allergen in it.
 * Without a meal there is nothing to pause (TC-URG-002).
 */
export function urgentSuspectIds(meal: SafetyMeal | null): string[] {
  if (!meal) return [];
  const allergenic = meal.ingredients.filter((i) => i.allergenTags.length > 0).map((i) => i.id);
  return [...new Set([...meal.firstTryIds, ...allergenic])];
}

/** Paused foods stay paused once (partial unique index): only the new ones get a row. */
export function notYetPaused(ingredientIds: string[], active: ReadonlySet<string>): string[] {
  return [...new Set(ingredientIds)].filter((id) => !active.has(id));
}
