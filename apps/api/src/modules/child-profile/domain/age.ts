import {
  addDays,
  addMonthsClamped,
  compareDates,
  daysBetween,
  parseLocalDate,
  type LocalDate,
} from '../../../shared/kernel/local-date.js';

export interface Age {
  months: number;
  days: number;
}

/** Whole months such that birth + months ≤ today (month-end clamped), then remaining days. */
export function ageOn(birthDate: LocalDate, today: LocalDate): Age {
  const b = parseLocalDate(birthDate);
  const t = parseLocalDate(today);
  let months = (t.year - b.year) * 12 + (t.month - b.month);
  if (compareDates(addMonthsClamped(birthDate, months), today) > 0) months -= 1;
  return { months, days: daysBetween(addMonthsClamped(birthDate, months), today) };
}

export interface BirthInfo {
  birthDate: LocalDate;
  isPremature: boolean;
  weeksEarly: number;
}

/** Age used for planning: corrected by the weeks born early (BR-10). */
export function planningAge(birth: BirthInfo, today: LocalDate): Age & { corrected: boolean } {
  if (!birth.isPremature) return { ...ageOn(birth.birthDate, today), corrected: false };
  const correctedBirth = addDays(birth.birthDate, birth.weeksEarly * 7);
  const age =
    compareDates(correctedBirth, today) > 0 ? { months: 0, days: 0 } : ageOn(correctedBirth, today);
  return { ...age, corrected: true };
}

export type StageId = 1 | 2 | 3 | 4;
export type NotPlannableReason = 'too_young' | 'too_old';

/** Months at which each stage opens (BR-11); menus stop after 24 months 0 days. */
export const STAGE_OPENS_AT: Record<StageId, number> = { 1: 6, 2: 8, 3: 10, 4: 12 };
const LAST_PLANNABLE_MONTH = 24;

export function stageForAge(age: Age): {
  stage: StageId | null;
  notPlannableReason: NotPlannableReason | null;
} {
  if (age.months < STAGE_OPENS_AT[1]) return { stage: null, notPlannableReason: 'too_young' };
  if (age.months > LAST_PLANNABLE_MONTH || (age.months === LAST_PLANNABLE_MONTH && age.days > 0)) {
    return { stage: null, notPlannableReason: 'too_old' };
  }
  const stage = ([4, 3, 2, 1] as const).find((id) => age.months >= STAGE_OPENS_AT[id])!;
  return { stage, notPlannableReason: null };
}
