import type { MealDtoSlot } from '@appandam/api-client';
import { vi } from '../../strings/vi';

/** Everyone is in Vietnam for the MVP (docs §7.8); UTC+7 all year, no daylight saving. */
const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const OFFSET = '+07:00';
const MINUTE = 60_000;

const DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function todayInVietnam(now: Date): string {
  return DATE_FORMAT.format(now);
}

const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

/** "Thứ Năm, 24 tháng 9" — spelled out here, ICU data for `vi` differs between runtimes. */
export function dayHeading(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[day.getUTCDay()]}, ${day.getUTCDate()} tháng ${day.getUTCMonth() + 1}`;
}

const TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "11:40" in Vietnam, whatever the device's time zone. */
export function timeInVietnam(at: Date | string): string {
  return TIME_FORMAT.format(new Date(at));
}

/** "24/9" */
export function shortDate(date: string): string {
  const [, month, day] = date.split('-');
  return `${Number(day)}/${Number(month)}`;
}

/** Monday of the week containing `date` (weeks start on Monday, docs §7.8). */
export function weekStartOf(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/** "21–27/9", or "28/9–4/10" across months. */
export function weekRange(monday: string): string {
  const sunday = addDays(monday, 6);
  const [a, b] = [new Date(`${monday}T00:00:00Z`), new Date(`${sunday}T00:00:00Z`)];
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()}–${shortDate(sunday)}`
    : `${shortDate(monday)}–${shortDate(sunday)}`;
}

export function mealInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${OFFSET}`);
}

/** "còn 1 giờ 20 phút", rounded up so the last seconds still read "còn 1 phút". */
export function countdown(mealAt: Date, now: Date): string {
  const minutes = Math.ceil((mealAt.getTime() - now.getTime()) / MINUTE);
  if (minutes <= 0) return vi.today.due;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts = [hours > 0 && `${hours} giờ`, rest > 0 && `${rest} phút`].filter(Boolean);
  return `còn ${parts.join(' ')}`;
}

export function slotLabel(slot: MealDtoSlot): string {
  return vi.slots[slot];
}

export function isSnackSlot(slot: MealDtoSlot): boolean {
  return slot.endsWith('snack');
}

export function daySummary(slots: MealDtoSlot[]): string {
  const snacks = slots.filter(isSnackSlot).length;
  const mains = slots.length - snacks;
  return [mains > 0 && `${mains} bữa chính`, snacks > 0 && `${snacks} bữa phụ`]
    .filter(Boolean)
    .join(' · ');
}

const QTY = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

/** "Món của bạn" may leave the quantity or unit out (BR-81). */
export function formatQty(qty: number | null, unit: string | null): string {
  if (qty === null) return vi.recipe.anyQty;
  return unit ? `${QTY.format(qty)} ${unit}` : QTY.format(qty);
}

export function avoidSummary(names: string[]): string {
  const shown = names.slice(0, 2).join(', ');
  return names.length > 2 ? `${shown} +${names.length - 2}` : shown;
}

/** Only the first letter: "Đậu Hà Lan" reads "đậu Hà Lan" mid-sentence, the place name intact. */
const lowerFirst = (name: string) => name.charAt(0).toLocaleLowerCase('vi') + name.slice(1);

/** "Cá hồi và rau ngót" — foods in a sentence, joined with "và", capitalised to open it. */
export function namesSentence(names: string[]): string {
  const lower = names.map(lowerFirst);
  const text =
    lower.length > 1 ? `${lower.slice(0, -1).join(', ')} và ${lower.at(-1)}` : (lower[0] ?? '');
  return text.charAt(0).toLocaleUpperCase('vi') + text.slice(1);
}

export function firstTryNames(names: string[]): string {
  return names.map(lowerFirst).join(', ');
}
