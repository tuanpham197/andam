import fc from 'fast-check';
import { addDays, compareDates } from '../../../shared/kernel/local-date.js';
import { ageOn, planningAge, stageForAge } from './age.js';

describe('ageOn (BR-10)', () => {
  it.each([
    ['TC-AGE-001 bé Na', '2026-01-12', '2026-09-24', 8, 12],
    ['TC-AGE-003 exactly 6 months', '2026-03-24', '2026-09-24', 6, 0],
    ['TC-AGE-004 one day before 6 months', '2026-03-25', '2026-09-24', 5, 30],
    ['TC-AGE-008 born on the 31st, short next month', '2026-01-31', '2026-02-28', 1, 0],
    ['TC-AGE-009 leap day, a year later', '2024-02-29', '2025-02-28', 12, 0],
    ['TC-AGE-009 leap day, a year and a day later', '2024-02-29', '2025-03-01', 12, 1],
    ['TC-AGE-010 born today', '2026-09-24', '2026-09-24', 0, 0],
    ['born yesterday', '2026-09-23', '2026-09-24', 0, 1],
    ['across a year', '2025-12-20', '2026-01-19', 0, 30],
  ])('%s', (_label, birth, today, months, days) => {
    expect(ageOn(birth, today)).toEqual({ months, days });
  });

  it('TC-AGE-017 never decreases as time passes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 800 }),
        fc.integer({ min: 0, max: 60 }),
        (birthOffset, step) => {
          const birth = addDays('2024-01-01', birthOffset);
          const today = addDays(birth, 200);
          const later = addDays(today, step);
          const a = ageOn(birth, today);
          const b = ageOn(birth, later);
          return a.months * 31 + a.days <= b.months * 31 + b.days;
        },
      ),
    );
  });
});

describe('planningAge (BR-10 corrected age)', () => {
  it('uses the real age when not premature', () => {
    expect(
      planningAge({ birthDate: '2026-01-12', isPremature: false, weeksEarly: 0 }, '2026-09-24'),
    ).toEqual({
      months: 8,
      days: 12,
      corrected: false,
    });
  });

  it('TC-AGE-002 subtracts the weeks born early', () => {
    expect(
      planningAge({ birthDate: '2026-01-12', isPremature: true, weeksEarly: 3 }, '2026-09-24'),
    ).toEqual({
      months: 7,
      days: 22,
      corrected: true,
    });
  });

  it('TC-AGE-012 can make a baby too young even though the real age is over 6 months', () => {
    const age = planningAge(
      { birthDate: '2026-03-19', isPremature: true, weeksEarly: 2 },
      '2026-09-24',
    );
    expect(age.months).toBe(5);
  });

  it('counts a corrected birth date after today as age zero', () => {
    const age = planningAge(
      { birthDate: '2026-09-20', isPremature: true, weeksEarly: 4 },
      '2026-09-24',
    );
    expect(age).toEqual({ months: 0, days: 0, corrected: true });
    expect(compareDates(addDays('2026-09-20', 28), '2026-09-24')).toBeGreaterThan(0);
  });
});

describe('stageForAge (BR-11)', () => {
  it.each([
    [{ months: 5, days: 30 }, null, 'too_young'],
    [{ months: 6, days: 0 }, 1, null],
    [{ months: 7, days: 30 }, 1, null],
    [{ months: 8, days: 0 }, 2, null],
    [{ months: 9, days: 30 }, 2, null],
    [{ months: 10, days: 0 }, 3, null],
    [{ months: 11, days: 30 }, 3, null],
    [{ months: 12, days: 0 }, 4, null],
    [{ months: 23, days: 30 }, 4, null],
    [{ months: 24, days: 0 }, 4, null],
    [{ months: 24, days: 1 }, null, 'too_old'],
    [{ months: 30, days: 0 }, null, 'too_old'],
  ])('TC-AGE-003..007 %j → stage %j (%s)', (age, stage, reason) => {
    expect(stageForAge(age)).toEqual({ stage, notPlannableReason: reason });
  });
});
