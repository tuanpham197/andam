import {
  InvalidLikingError,
  LoggedAtOutOfRangeError,
  MealLoggedTwiceError,
  MealNotStartedError,
  NoteTooLongError,
  ReactionWithoutSymptomError,
} from './errors.js';
import { FUTURE_TOLERANCE_MS, MealLog, exposureUpdates, suspectIngredientIds } from './meal-log.js';
import type { LoggableMeal } from './model.js';

// 11:40 in Vietnam on 24/09/2026.
const NOW = new Date('2026-09-24T04:40:00Z');

function lunch(overrides: Partial<LoggableMeal> = {}): LoggableMeal {
  return {
    id: 'm-1',
    childId: 'c-1',
    date: '2026-09-24',
    slot: 'lunch',
    time: '11:00',
    status: 'planned',
    dish: { id: 'dish_chao', name: 'Cháo cá hồi rau ngót', custom: false },
    ingredients: [
      { id: 'ing_gao', name: 'Gạo tẻ', allergenTags: [] },
      { id: 'ing_ca_hoi', name: 'Cá hồi', allergenTags: ['fish'] },
      { id: 'ing_rau_ngot', name: 'Rau ngót', allergenTags: [] },
    ],
    firstTryIds: ['ing_rau_ngot'],
    ...overrides,
  };
}

const record = (overrides: Partial<Parameters<typeof MealLog.record>[0]> = {}) =>
  MealLog.record({
    id: 'log-1',
    meal: lunch(),
    loggedAt: NOW,
    now: NOW,
    amount: 'half',
    liking: 3,
    actorId: 'u-1',
    ...overrides,
  });

describe('MealLog.record (FR-060..063)', () => {
  it('TC-LOG-001 records the amount and liking of the meal', () => {
    const log = record();
    expect(log).toMatchObject({
      id: 'log-1',
      mealId: 'm-1',
      childId: 'c-1',
      dishId: 'dish_chao',
      loggedAt: NOW,
      amount: 'half',
      liking: 3,
      reaction: null,
      actorId: 'u-1',
      outcome: 'eaten',
    });
  });

  it('TC-LOG-002 "Không ăn" marks the meal refused', () => {
    expect(record({ amount: 'none', liking: 1 }).outcome).toBe('refused');
  });

  it('logs a prepared meal, and a meal of the day before (late logging)', () => {
    expect(record({ meal: lunch({ status: 'prepared' }) }).outcome).toBe('eaten');
    expect(record({ meal: lunch({ date: '2026-09-23' }) }).mealId).toBe('m-1');
  });

  it.each(['eaten', 'refused', 'skipped'] as const)(
    'TC-LOG-004 refuses a meal already %s',
    (status) => {
      expect(() => record({ meal: lunch({ status }) })).toThrow(MealLoggedTwiceError);
    },
  );

  it('refuses a meal of a later day, but allows tonight’s dinner early', () => {
    expect(() => record({ meal: lunch({ date: '2026-09-25' }) })).toThrow(MealNotStartedError);
    expect(record({ meal: lunch({ time: '18:00' }) }).outcome).toBe('eaten');
  });

  describe('TC-LOG-006 the time it was logged', () => {
    it('allows a phone clock up to 5 minutes ahead', () => {
      const ahead = new Date(NOW.getTime() + FUTURE_TOLERANCE_MS);
      expect(record({ loggedAt: ahead }).loggedAt).toEqual(ahead);
    });

    it('refuses more than 5 minutes in the future', () => {
      const ahead = new Date(NOW.getTime() + FUTURE_TOLERANCE_MS + 1);
      expect(() => record({ loggedAt: ahead })).toThrow(LoggedAtOutOfRangeError);
    });

    it('allows the day before the meal (Vietnam time), not two days before', () => {
      // 00:00 on 23/09 in Vietnam is 17:00 UTC on 22/09.
      expect(record({ loggedAt: new Date('2026-09-22T17:00:00Z') }).id).toBe('log-1');
      expect(() => record({ loggedAt: new Date('2026-09-22T16:59:59Z') })).toThrow(
        LoggedAtOutOfRangeError,
      );
    });
  });

  it.each([0, 6, 2.5, Number.NaN])('TC-LOG-003 refuses a liking of %s', (liking) => {
    expect(() => record({ liking })).toThrow(InvalidLikingError);
  });

  it.each([1, 5])('TC-LOG-003 accepts a liking of %s', (liking) => {
    expect(record({ liking }).liking).toBe(liking);
  });

  describe('reaction (UC-09)', () => {
    it('keeps each symptom once, the severity and a trimmed NFC note', () => {
      const log = record({
        reaction: {
          symptoms: ['rash', 'rash', 'fussy'],
          severity: 'mild',
          note: '  Nổi mẩn ở má  ',
        },
      });
      expect(log.reaction).toEqual({
        symptoms: ['rash', 'fussy'],
        severity: 'mild',
        note: 'Nổi mẩn ở má',
      });
    });

    it('stores an empty or missing note as none', () => {
      expect(
        record({ reaction: { symptoms: ['vomit'], severity: 'unknown', note: '   ' } }).reaction,
      ).toEqual({ symptoms: ['vomit'], severity: 'unknown', note: null });
      expect(
        record({ reaction: { symptoms: ['vomit'], severity: 'unknown' } }).reaction!.note,
      ).toBeNull();
    });

    it('TC-LOG-007 refuses a severity without any symptom', () => {
      expect(() => record({ reaction: { symptoms: [], severity: 'severe' } })).toThrow(
        ReactionWithoutSymptomError,
      );
    });

    it('TC-LOG-008 accepts a 500-character note and refuses 501 (counted by character)', () => {
      const emoji = '😢'.repeat(500);
      expect(
        record({ reaction: { symptoms: ['fussy'], severity: 'mild', note: emoji } }).reaction!.note,
      ).toBe(emoji);
      expect(() =>
        record({ reaction: { symptoms: ['fussy'], severity: 'mild', note: 'a'.repeat(501) } }),
      ).toThrow(NoteTooLongError);
    });

    it('treats a null reaction as none', () => {
      expect(record({ reaction: null }).reaction).toBeNull();
    });
  });

  it('restores a stored log without sharing its reaction', () => {
    const stored = record({ reaction: { symptoms: ['rash'], severity: 'mild' } });
    const state = {
      id: stored.id,
      mealId: stored.mealId,
      childId: stored.childId,
      dishId: stored.dishId,
      loggedAt: stored.loggedAt,
      amount: stored.amount,
      liking: stored.liking,
      reaction: stored.reaction,
      actorId: null,
    };
    const restored = MealLog.restore(state);
    expect(restored.reaction).toEqual(stored.reaction);
    expect(restored.reaction).not.toBe(state.reaction);
    expect(MealLog.restore({ ...state, reaction: null }).reaction).toBeNull();
  });
});

describe('suspectIngredientIds (BR-40)', () => {
  it('pauses nothing without a reaction', () => {
    expect(suspectIngredientIds(lunch(), false)).toEqual([]);
  });

  it('TC-LOG-009 pauses only the first-tried foods of the meal', () => {
    expect(suspectIngredientIds(lunch(), true)).toEqual(['ing_rau_ngot']);
  });

  it('TC-LOG-010 pauses the allergenic foods when nothing was new', () => {
    expect(suspectIngredientIds(lunch({ firstTryIds: [] }), true)).toEqual(['ing_ca_hoi']);
  });

  it('TC-LOG-011 pauses nothing when the meal had neither new nor allergenic foods', () => {
    const plain = lunch({
      firstTryIds: [],
      ingredients: [{ id: 'ing_gao', name: 'Gạo tẻ', allergenTags: [] }],
    });
    expect(suspectIngredientIds(plain, true)).toEqual([]);
  });
});

describe('exposureUpdates (BR-44)', () => {
  it('marks every food tried when eaten without a reaction', () => {
    expect(exposureUpdates(lunch(), record())).toEqual([
      { ingredientId: 'ing_gao', at: NOW, tried: true },
      { ingredientId: 'ing_ca_hoi', at: NOW, tried: true },
      { ingredientId: 'ing_rau_ngot', at: NOW, tried: true },
    ]);
  });

  it('records an exposure that is not "tried" after a reaction', () => {
    const log = record({ reaction: { symptoms: ['rash'], severity: 'mild' } });
    expect(exposureUpdates(lunch(), log).every((u) => !u.tried)).toBe(true);
  });

  it('TC-LOG-002 changes nothing when the child ate none', () => {
    expect(exposureUpdates(lunch(), record({ amount: 'none', liking: 1 }))).toEqual([]);
  });
});
