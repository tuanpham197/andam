import { APP_TIMEZONE, addDays, toLocalDate } from '../../../shared/kernel/local-date.js';
import {
  InvalidLikingError,
  LoggedAtOutOfRangeError,
  MealLoggedTwiceError,
  MealNotStartedError,
  NoteTooLongError,
  ReactionWithoutSymptomError,
} from './errors.js';
import type { EatAmount, LoggableMeal, MealOutcome, Severity, Symptom } from './model.js';

export const MAX_NOTE_LENGTH = 500;
/** A phone clock a little ahead must not block saving (TC-LOG-006). */
export const FUTURE_TOLERANCE_MS = 5 * 60_000;

export interface Reaction {
  symptoms: Symptom[];
  severity: Severity;
  note: string | null;
}

interface MealLogState {
  id: string;
  mealId: string;
  childId: string;
  dishId: string;
  loggedAt: Date;
  amount: EatAmount;
  liking: number;
  reaction: Reaction | null;
  actorId: string | null;
}

function normalizeNote(note: string | null | undefined): string | null {
  const text = (note ?? '').normalize('NFC').trim();
  if ([...text].length > MAX_NOTE_LENGTH) throw new NoteTooLongError();
  return text === '' ? null : text;
}

/** FR-060..063: what the child ate, how much they liked it and anything unusual seen after. */
export class MealLog {
  private constructor(private readonly state: MealLogState) {}

  static record(input: {
    id: string;
    meal: LoggableMeal;
    loggedAt: Date;
    now: Date;
    amount: EatAmount;
    liking: number;
    reaction?: { symptoms: Symptom[]; severity: Severity; note?: string | null } | null;
    actorId: string;
  }): MealLog {
    const { meal, loggedAt, now } = input;
    if (meal.status !== 'planned' && meal.status !== 'prepared') throw new MealLoggedTwiceError();
    // Today's dinner may be logged early; tomorrow's meals have not happened yet.
    if (meal.date > toLocalDate(now, APP_TIMEZONE)) throw new MealNotStartedError();
    const loggedDay = toLocalDate(loggedAt, APP_TIMEZONE);
    if (
      loggedAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS ||
      loggedDay < addDays(meal.date, -1)
    ) {
      throw new LoggedAtOutOfRangeError();
    }
    if (!Number.isInteger(input.liking) || input.liking < 1 || input.liking > 5) {
      throw new InvalidLikingError();
    }
    let reaction: Reaction | null = null;
    if (input.reaction) {
      const symptoms = [...new Set(input.reaction.symptoms)];
      if (symptoms.length === 0) throw new ReactionWithoutSymptomError();
      reaction = {
        symptoms,
        severity: input.reaction.severity,
        note: normalizeNote(input.reaction.note),
      };
    }
    return new MealLog({
      id: input.id,
      mealId: meal.id,
      childId: meal.childId,
      dishId: meal.dish.id,
      loggedAt,
      amount: input.amount,
      liking: input.liking,
      reaction,
      actorId: input.actorId,
    });
  }

  static restore(state: MealLogState): MealLog {
    return new MealLog({ ...state, reaction: state.reaction && { ...state.reaction } });
  }

  get id() {
    return this.state.id;
  }
  get mealId() {
    return this.state.mealId;
  }
  get childId() {
    return this.state.childId;
  }
  get dishId() {
    return this.state.dishId;
  }
  get loggedAt() {
    return this.state.loggedAt;
  }
  get amount() {
    return this.state.amount;
  }
  get liking() {
    return this.state.liking;
  }
  get reaction() {
    return this.state.reaction;
  }
  get actorId() {
    return this.state.actorId;
  }

  /** "Không ăn" marks the meal refused; any other amount means it was eaten (UC-08 step 4). */
  get outcome(): MealOutcome {
    return this.state.amount === 'none' ? 'refused' : 'eaten';
  }
}

/**
 * BR-40: after a reaction, pause the foods tried for the first time in that meal; when nothing
 * was new, pause its common allergens instead. No symptom, nothing to pause.
 */
export function suspectIngredientIds(meal: LoggableMeal, hasReaction: boolean): string[] {
  if (!hasReaction) return [];
  if (meal.firstTryIds.length > 0) return [...meal.firstTryIds];
  return meal.ingredients.filter((i) => i.allergenTags.length > 0).map((i) => i.id);
}

export interface ExposureUpdate {
  ingredientId: string;
  at: Date;
  /** BR-44: eaten without a reaction. A reaction meal still counts as a first exposure. */
  tried: boolean;
}

/** What eating this meal teaches about each of its foods; nothing when the child ate none. */
export function exposureUpdates(meal: LoggableMeal, log: MealLog): ExposureUpdate[] {
  if (log.amount === 'none') return [];
  return meal.ingredients.map((i) => ({
    ingredientId: i.id,
    at: log.loggedAt,
    tried: log.reaction === null,
  }));
}
