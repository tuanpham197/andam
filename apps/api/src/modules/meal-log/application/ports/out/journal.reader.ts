import type { Reaction } from '../../../domain/meal-log.js';
import type { EatAmount } from '../../../domain/model.js';

export const JOURNAL_READER = Symbol('JOURNAL_READER');

export interface JournalDish {
  id: string;
  name: string;
  custom: boolean;
}

/** One line of the journal (G02): a logged meal or an opened "Dấu hiệu nguy hiểm". */
export type JournalEntry =
  | {
      kind: 'meal';
      id: string;
      at: Date;
      date: string;
      slot: string;
      dish: JournalDish;
      amount: EatAmount;
      liking: number;
      reaction: Reaction | null;
      pausedIngredients: { id: string; name: string }[];
      /** FR-118: who logged it (null: account deleted). */
      actorName: string | null;
    }
  | {
      kind: 'urgent';
      id: string;
      at: Date;
      meal: { date: string; slot: string; dish: JournalDish } | null;
      contactedMedicalAt: Date | null;
      pausedIngredients: { id: string; name: string }[];
      actorName: string | null;
    };

export interface JournalCursor {
  at: Date;
  id: string;
}

export interface JournalReader {
  /** Up to `limit` entries strictly older than `before`, newest first (time, then id). */
  page(childId: string, before: JournalCursor | null, limit: number): Promise<JournalEntry[]>;
  ownsChild(userId: string, childId: string): Promise<boolean>;
}
