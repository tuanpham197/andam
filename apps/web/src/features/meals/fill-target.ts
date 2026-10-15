import type { MealDtoSlot } from '@appandam/api-client';
import { isSnackSlot } from './format';

/** An empty slot G15 should fill once the new dish is saved (UC-24, FR-141). */
export interface FillTarget {
  date: string;
  slot: MealDtoSlot;
}

const SLOTS: readonly string[] = [
  'breakfast',
  'morning_snack',
  'lunch',
  'afternoon_snack',
  'dinner',
  'extra_snack',
];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function fillLink(target: FillTarget): string {
  const params = new URLSearchParams({
    mealType: isSnackSlot(target.slot) ? 'snack' : 'main',
    fillDate: target.date,
    fillSlot: target.slot,
  });
  return `/dishes/new?${params.toString()}`;
}

export function readFillTarget(params: URLSearchParams): FillTarget | null {
  const date = params.get('fillDate');
  const slot = params.get('fillSlot');
  if (!date || !DATE.test(date) || !slot || !SLOTS.includes(slot)) return null;
  return { date, slot: slot as MealDtoSlot };
}
