/** A calendar date without time zone, `YYYY-MM-DD` (birth dates, plan days). */
export type LocalDate = string;

const SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function parseLocalDate(value: LocalDate): { year: number; month: number; day: number } {
  const [, y, m, d] = SHAPE.exec(value)!;
  return { year: Number(y), month: Number(m), day: Number(d) };
}

const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

const format = (year: number, month: number, day: number): LocalDate =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export function isValidLocalDate(value: string): boolean {
  if (!SHAPE.test(value)) return false;
  const { year, month, day } = parseLocalDate(value);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/** The calendar date of `instant` in `timeZone` (TC-AGE-016). */
export function toLocalDate(instant: Date, timeZone: string): LocalDate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** Wall-clock `HH:mm` of `instant` in `timeZone` (meal times are compared as strings). */
export function toLocalTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
}

/** 31 Jan + 1 month = 28 Feb (or 29 in a leap year). */
export function addMonthsClamped(date: LocalDate, months: number): LocalDate {
  const { year, month, day } = parseLocalDate(date);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  return format(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
}

const toUtcMs = (date: LocalDate) => {
  const { year, month, day } = parseLocalDate(date);
  return Date.UTC(year, month - 1, day);
};

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(toUtcMs(date) + days * DAY_MS);
  return format(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** All users are in Vietnam for the MVP (docs §7.8); users.timezone is kept for later. */
export const APP_TIMEZONE = 'Asia/Ho_Chi_Minh';

/** Monday of the week containing `date`; weeks start on Monday (docs §7.8). */
export function weekStartOf(date: LocalDate): LocalDate {
  const weekday = new Date(toUtcMs(date)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((weekday + 6) % 7));
}
