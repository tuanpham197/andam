import { daysBetween, type LocalDate } from '../../../shared/kernel/local-date.js';
import { toSearchText } from '../../../shared/kernel/search-text.js';
import { isLiked, variantFor, WINDOW_DAYS } from './menu-engine.js';
import type { MealSlot, MealUse, PlanDish, PlanningContext, Texture } from './model.js';
import { offered } from './model.js';
import { newIngredientIds } from './novelty.js';
import {
  exclusionReason,
  summarizeExclusions,
  type ExclusionReason,
  type ExclusionSummary,
} from './safety-filter.js';

/** S05 chips: proteins with a chip of their own, snacks and "Món của bạn". Egg dishes show under "all". */
export const LIBRARY_CHIPS = [
  'all',
  'chicken',
  'fish',
  'beef',
  'pork',
  'legume',
  'snack',
  'custom',
] as const;
export type LibraryChip = (typeof LIBRARY_CHIPS)[number];

export interface LibraryRequest {
  today: LocalDate;
  query: string;
  chip: LibraryChip;
  /** "Chưa ăn 7 ngày" (FR-048). */
  fresh: boolean;
  /** Meals eaten recently, any order. */
  eaten: MealUse[];
}

export interface LibraryEntry {
  dish: PlanDish;
  texture: Texture;
  newIngredientIds: string[];
  liked: boolean;
  lastEaten: { daysAgo: number; slot: MealSlot } | null;
}

export interface LibraryResult {
  dishes: LibraryEntry[];
  /** Unsafe dishes that match the search and chip: never shown, only explained (FR-050). */
  hidden: ExclusionSummary & { items: { dishId: string; reason: ExclusionReason }[] };
}

function matchesChip(dish: PlanDish, chip: LibraryChip): boolean {
  if (chip === 'all') return true;
  if (chip === 'snack') return dish.mealType === 'snack';
  if (chip === 'custom') return dish.custom === true;
  return dish.mealType === 'main' && dish.mainProtein === chip;
}

/** Lowercase words, accents kept: "bò" (beef) must not find "bơ" (avocado) when typed with accents. */
const accentedWords = (value: string) =>
  value.normalize('NFC').toLocaleLowerCase('vi').split(/\s+/).filter(Boolean);
const plainWords = (value: string) => toSearchText(value).split(' ').filter(Boolean);

/**
 * Most precise reading first: accented whole words (when the parent typed accents), then whole
 * words without accents, then the last word as a prefix while the parent is still typing.
 * Whole words matter because without accents "gà" is "ga", a prefix of "gao" (gạo).
 */
function search(ctx: PlanningContext, dishes: PlanDish[], query: string): PlanDish[] {
  const textOf = (dish: PlanDish) =>
    [dish.name, ...dish.ingredientIds.map((id) => ctx.ingredients.get(id)?.name ?? '')].join(' ');
  const whole = (words: string[], text: string[]) => words.every((w) => text.includes(w));
  const typing = (words: string[], text: string[]) =>
    words.every((w, i) =>
      i === words.length - 1 ? text.some((t) => t.startsWith(w)) : text.includes(w),
    );

  const accented = accentedWords(query);
  const plain = plainWords(query);
  const readings: ((dish: PlanDish) => boolean)[] = [
    (dish) => whole(plain, plainWords(textOf(dish))),
    (dish) => typing(plain, plainWords(textOf(dish))),
  ];
  if (accented.join(' ') !== plain.join(' '))
    readings.unshift((dish) => whole(accented, accentedWords(textOf(dish))));

  for (const reading of readings) {
    const found = dishes.filter(reading);
    if (found.length > 0) return found;
  }
  return [];
}

export function filterLibrary(ctx: PlanningContext, request: LibraryRequest): LibraryResult {
  const inChip = offered(ctx.dishes).filter((dish) => matchesChip(dish, request.chip));
  const matching = request.query.trim() ? search(ctx, inChip, request.query) : inChip;

  const visible: PlanDish[] = [];
  const hiddenItems: LibraryResult['hidden']['items'] = [];
  for (const dish of matching) {
    const reason = exclusionReason(dish, ctx, request.today);
    if (reason) hiddenItems.push({ dishId: dish.id, reason });
    else visible.push(dish);
  }

  const lastEaten = (dishId: string) => {
    const latest = request.eaten
      .filter((u) => u.dishId === dishId)
      .map((u) => ({ daysAgo: daysBetween(u.date, request.today), slot: u.slot }))
      .filter((u) => u.daysAgo >= 0 && u.daysAgo <= WINDOW_DAYS)
      .sort((a, b) => a.daysAgo - b.daysAgo)[0];
    return latest ?? null;
  };

  const entries = visible
    .map((dish) => ({
      dish,
      texture: variantFor(dish, ctx.stage).texture,
      newIngredientIds: newIngredientIds(dish, ctx),
      liked: isLiked(ctx, dish.id),
      lastEaten: lastEaten(dish.id),
    }))
    .filter((entry) => !request.fresh || entry.lastEaten === null)
    .sort((a, b) => a.dish.name.localeCompare(b.dish.name, 'vi'));

  return {
    dishes: entries,
    hidden: { ...summarizeExclusions(hiddenItems.map((i) => i.reason)), items: hiddenItems },
  };
}
