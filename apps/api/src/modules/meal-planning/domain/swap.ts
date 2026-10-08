import { daysBetween, type LocalDate } from '../../../shared/kernel/local-date.js';
import { rankSlot, totalMinutes, variantFor, WINDOW_DAYS, type ReasonCode } from './menu-engine.js';
import type { MealSlot, MealUse, PlanningContext, Texture } from './model.js';
import { offered } from './model.js';
import { exclusionReason, summarizeExclusions, type ExclusionSummary } from './safety-filter.js';

export const SWAP_REASONS = ['missing_ingredient', 'disliked', 'faster', 'other'] as const;
export type SwapReason = (typeof SWAP_REASONS)[number];

export type SwapReasonCode = ReasonCode | 'FASTER';

/** History of a swap (`swap_events`): which dish replaced which, and why (BR-29 signal). */
export interface SwapEvent {
  id: string;
  mealId: string;
  fromDishId: string;
  toDishId: string;
  reason: SwapReason;
  createdAt: Date;
  /** Who swapped (BR-78). */
  actorId: string | null;
}

export const MAX_SUGGESTIONS = 5;
const MAX_REASONS = 3;

/** What a parent reads first on the "Phù hợp nhất" card (design S02). */
const DISPLAY_ORDER: SwapReasonCode[] = [
  'FASTER',
  'NOT_USED_7D',
  'DIFFERENT_PROTEIN',
  'LIKED',
  'FOUR_GROUPS',
  'LEAST_USED_PROTEIN',
  'NEW_INGREDIENT',
];

export interface SwapRequest {
  date: LocalDate;
  slot: MealSlot;
  currentDishId: string;
  reason: SwapReason;
  /** Meals ±7 days around the date, without the meal being swapped. */
  history: MealUse[];
  allergenIntroductions: LocalDate[];
}

export interface SwapCandidate {
  dishId: string;
  texture: Texture;
  portionText: string;
  newIngredientIds: string[];
  reasons: SwapReasonCode[];
  /** Minutes saved against the current dish; 0 when not quicker. */
  fasterByMin: number;
  /** Nearest use within the week (negative: days ago, positive: days ahead), else null. */
  repeatInDays: number | null;
}

export interface SwapSuggestions {
  ranked: SwapCandidate[];
  excluded: ExclusionSummary;
  relaxedWindowDays: 3 | null;
}

/**
 * Ranked replacements for one meal (UC-06): the day-planning pipeline for that slot, narrowed by
 * the parent's reason. Safety exclusions are counted over the dishes of the same kind (FR-043).
 */
export function suggestSwaps(ctx: PlanningContext, request: SwapRequest): SwapSuggestions {
  const current = ctx.dishes.find((d) => d.id === request.currentDishId)!;
  const others = offered(ctx.dishes).filter(
    (d) => d.id !== current.id && d.mealType === current.mealType,
  );
  const reasons = others.map((d) => exclusionReason(d, ctx, request.date));
  const safe = others.filter((_, i) => reasons[i] === null);
  const currentMinutes = totalMinutes(current);
  const sharesMain = (ids: string[]) => ids.some((id) => current.mainIngredientIds.includes(id));

  const { ranked, relaxed } = rankSlot(ctx, safe, {
    date: request.date,
    slot: request.slot,
    uses: request.history,
    allergenIntroductions: request.allergenIntroductions,
    keep: (dish) => {
      if (request.reason === 'faster') return totalMinutes(dish) < currentMinutes;
      if (request.reason === 'missing_ingredient' || request.reason === 'disliked')
        return !sharesMain(dish.mainIngredientIds);
      return true;
    },
    bonus: request.reason === 'faster' ? (dish) => currentMinutes - totalMinutes(dish) : undefined,
  });

  const nearestUse = (dishId: string) => {
    const gaps = request.history
      .filter((u) => u.dishId === dishId)
      .map((u) => daysBetween(request.date, u.date))
      .filter((gap) => Math.abs(gap) <= WINDOW_DAYS)
      .sort((a, b) => Math.abs(a) - Math.abs(b));
    return gaps[0] ?? null;
  };

  return {
    ranked: ranked.slice(0, MAX_SUGGESTIONS).map(({ dish, reasons: codes, firstTries }) => {
      const variant = variantFor(dish, ctx.stage);
      const all: SwapReasonCode[] = request.reason === 'faster' ? ['FASTER', ...codes] : codes;
      return {
        dishId: dish.id,
        texture: variant.texture,
        portionText: variant.portionText,
        newIngredientIds: firstTries,
        reasons: DISPLAY_ORDER.filter((code) => all.includes(code)).slice(0, MAX_REASONS),
        fasterByMin: Math.max(0, currentMinutes - totalMinutes(dish)),
        repeatInDays: nearestUse(dish.id),
      };
    }),
    excluded: summarizeExclusions(reasons),
    relaxedWindowDays: relaxed ? 3 : null,
  };
}
