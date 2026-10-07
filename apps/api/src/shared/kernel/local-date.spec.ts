import {
  addDays,
  addMonthsClamped,
  compareDates,
  isValidLocalDate,
  parseLocalDate,
  toLocalDate,
  toLocalTime,
  weekStartOf,
} from './local-date.js';

describe('local dates', () => {
  it('TC-AGE-016 takes the calendar date in the user timezone, not UTC', () => {
    // 00:30 on 24/09 in Vietnam is still 23/09 in UTC.
    expect(toLocalDate(new Date('2026-09-23T17:30:00Z'), 'Asia/Ho_Chi_Minh')).toBe('2026-09-24');
    expect(toLocalDate(new Date('2026-09-23T16:59:59Z'), 'Asia/Ho_Chi_Minh')).toBe('2026-09-23');
  });

  it('gives the wall-clock time in the user timezone as HH:mm', () => {
    expect(toLocalTime(new Date('2026-09-24T02:05:00Z'), 'Asia/Ho_Chi_Minh')).toBe('09:05');
    expect(toLocalTime(new Date('2026-09-23T17:00:00Z'), 'Asia/Ho_Chi_Minh')).toBe('00:00');
  });

  it.each(['2026-09-24', '2024-02-29', '2026-12-31'])('accepts %s', (value) => {
    expect(isValidLocalDate(value)).toBe(true);
  });

  it.each([
    '2026-02-30',
    '2025-02-29',
    '2026-13-01',
    '2026-00-10',
    '26-09-24',
    '2026/09/24',
    '',
    'x',
  ])('TC-X5 rejects %j', (value) => {
    expect(isValidLocalDate(value)).toBe(false);
  });

  it('parses into year/month/day', () => {
    expect(parseLocalDate('2026-01-12')).toEqual({ year: 2026, month: 1, day: 12 });
  });

  it('adds months clamping to the end of shorter months', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonthsClamped('2024-02-29', 12)).toBe('2025-02-28');
    expect(addMonthsClamped('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonthsClamped('2026-03-10', 0)).toBe('2026-03-10');
  });

  it('adds days across months and years', () => {
    expect(addDays('2026-01-12', 21)).toBe('2026-02-02');
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('compares dates', () => {
    expect(compareDates('2026-09-24', '2026-09-25')).toBeLessThan(0);
    expect(compareDates('2026-09-25', '2026-09-24')).toBeGreaterThan(0);
    expect(compareDates('2026-09-24', '2026-09-24')).toBe(0);
  });

  it('finds the Monday a week starts on (docs §7.8)', () => {
    expect(weekStartOf('2026-09-24')).toBe('2026-09-21'); // Thursday
    expect(weekStartOf('2026-09-21')).toBe('2026-09-21');
    expect(weekStartOf('2026-09-27')).toBe('2026-09-21'); // Sunday
    expect(weekStartOf('2027-01-01')).toBe('2026-12-28');
  });
});
