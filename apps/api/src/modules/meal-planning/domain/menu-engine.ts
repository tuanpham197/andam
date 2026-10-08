import { daysBetween, type LocalDate } from '../../../shared/kernel/local-date.js';
import type {
  HealthState,
  MealSlot,
  MealUse,
  PlanDish,
  PlanningContext,
  ProteinSource,
  ScheduledSlot,
  Texture,
} from './model.js';
import { offered } from './model.js';
import { newAllergenIds, newIngredientIds } from './novelty.js';
import { exclusionReason } from './safety-filter.js';

export interface StageSchedule {
  mainMeals: number;
  snacksMin: number;
  schedule: ScheduledSlot[];
}

const isSnack = (slot: MealSlot) => slot.endsWith('snack');

// When a stage schedule lacks a snack slot that is needed (sick GĐ1), these times are used.
const SNACK_PREFERENCE: { slot: MealSlot; time: string }[] = [
  { slot: 'afternoon_snack', time: '15:00' },
  { slot: 'morning_snack', time: '09:30' },
  { slot: 'extra_snack', time: '20:00' },
];

/** Slots of a day: all main meals, the lower bound of snacks, one more snack while ill (BR-50). */
export function slotsForDay(stage: StageSchedule, health: HealthState): ScheduledSlot[] {
  const mains = stage.schedule.filter((s) => !isSnack(s.slot));
  const snackCount = stage.snacksMin + (health === 'normal' ? 0 : 1);
  const snacks = SNACK_PREFERENCE.slice(0, snackCount).map(
    (preferred) => stage.schedule.find((s) => s.slot === preferred.slot) ?? preferred,
  );
  return [...mains, ...snacks].sort((a, b) => a.time.localeCompare(b.time));
}

export type ReasonCode =
  | 'FOUR_GROUPS'
  | 'DIFFERENT_PROTEIN'
  | 'LEAST_USED_PROTEIN'
  | 'LIKED'
  | 'NOT_USED_7D'
  | 'NEW_INGREDIENT';

export interface PlannedDraft {
  slot: MealSlot;
  time: string;
  dishId: string;
  texture: Texture;
  portionText: string;
  newIngredientIds: string[];
  newAllergenIds: string[];
  reasons: ReasonCode[];
}

export interface DayRequest {
  date: LocalDate;
  slots: ScheduledSlot[];
  /** Meals kept around the date (±7 days, including other slots of the same day). */
  history: MealUse[];
  /** Days on which a new allergenic food was (or will be) introduced. */
  allergenIntroductions: LocalDate[];
}

export interface DayGeneration {
  meals: PlannedDraft[];
  unfilled: ScheduledSlot[];
  /** Set when the anti-repeat window had to shrink to 3 days for some slot (BR-21). */
  relaxedWindowDays: 3 | null;
}

export const WINDOW_DAYS = 7;
const RELAXED_WINDOW_DAYS = 3;
const MIN_CANDIDATES = 3;
const ALLERGEN_SPACING_DAYS = 3;
const INTRO_SLOTS = new Set<MealSlot>(['breakfast', 'lunch']);
const FOUR_GROUPS = ['carb', 'protein', 'fat', 'veg'] as const;

/** FNV-1a: stable tie-break so the same input always yields the same plan (NFR-009). */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function groupsOf(dish: PlanDish, ctx: PlanningContext): Set<string> {
  const groups = new Set<string>();
  for (const id of dish.ingredientIds) {
    const group = ctx.ingredients.get(id)!.foodGroup;
    groups.add(group === 'fruit' ? 'veg' : group);
  }
  return groups;
}

/** BR-26: the child finished most of it or rated it 4–5. */
export function isLiked(ctx: PlanningContext, dishId: string): boolean {
  const feedback = ctx.feedback.get(dishId);
  return (
    feedback !== undefined &&
    (feedback.liking >= 4 || feedback.amount === 'almost_all' || feedback.amount === 'all')
  );
}

export const totalMinutes = (dish: PlanDish) => dish.prepMin + dish.cookMin;

export function variantFor(dish: PlanDish, stage: PlanningContext['stage']) {
  return dish.variants.find((v) => v.stage === stage)!;
}

export interface ScoredDish {
  dish: PlanDish;
  score: number;
  reasons: ReasonCode[];
  firstTries: string[];
}

export interface SlotRequest {
  date: LocalDate;
  slot: MealSlot;
  /** Every meal known around the date, including the other slots of the same day. */
  uses: MealUse[];
  allergenIntroductions: LocalDate[];
  /** Narrows the candidates before the anti-repeat window (swap reasons, BR-27..29). */
  keep?: (dish: PlanDish) => boolean;
  /** Extra points, e.g. minutes saved when the parent asked for something faster. */
  bonus?: (dish: PlanDish) => number;
}

export interface SlotRanking {
  ranked: ScoredDish[];
  /** The 7-day anti-repeat window had to shrink to 3 days (BR-21). */
  relaxed: boolean;
}

/**
 * One slot of the pipeline (docs §7.7) after the hard filter: slot type and new-allergen rules,
 * anti-repeat window, scoring, stable order. Shared by day planning and swap suggestions.
 */
export function rankSlot(
  ctx: PlanningContext,
  safe: readonly PlanDish[],
  request: SlotRequest,
): SlotRanking {
  const dishById = new Map(ctx.dishes.map((d) => [d.id, d]));
  const { date, slot, uses } = request;
  const snack = isSnack(slot);

  const todaysDishes = uses
    .filter((u) => u.date === date)
    .map((u) => dishById.get(u.dishId))
    .filter((d) => d !== undefined);
  const introducedToday = todaysDishes.some((d) => newAllergenIds(d, ctx).length > 0);
  const recentIntro = request.allergenIntroductions.some((day) => {
    const gap = daysBetween(day, date);
    return gap >= 0 && gap < ALLERGEN_SPACING_DAYS;
  });

  const eligible = safe.filter((dish) => {
    if (dish.mealType !== (snack ? 'snack' : 'main')) return false;
    if (request.keep && !request.keep(dish)) return false;
    const allergens = newAllergenIds(dish, ctx).length;
    if (allergens === 0) return true;
    return allergens === 1 && INTRO_SLOTS.has(slot) && !introducedToday && !recentIntro;
  });

  const usedWithin = (days: number) =>
    new Set(uses.filter((u) => Math.abs(daysBetween(u.date, date)) <= days).map((u) => u.dishId));
  const fresh = (days: number) => {
    const used = usedWithin(days);
    return eligible.filter((d) => !used.has(d.id));
  };

  let candidates = fresh(WINDOW_DAYS);
  let relaxed = false;
  if (candidates.length < MIN_CANDIDATES) {
    const wider = fresh(RELAXED_WINDOW_DAYS);
    relaxed = wider.length > candidates.length;
    candidates = wider;
  }

  // Protein usage over the previous week, for the least-used preference.
  const proteinUses = new Map<ProteinSource, number>();
  for (const use of uses) {
    const gap = daysBetween(use.date, date);
    const protein = dishById.get(use.dishId)?.mainProtein;
    if (protein && gap > 0 && gap <= WINDOW_DAYS)
      proteinUses.set(protein, (proteinUses.get(protein) ?? 0) + 1);
  }
  const maxProteinUses = Math.max(1, ...proteinUses.values());
  const notRecent = usedWithin(WINDOW_DAYS);
  const todaysProteins = new Set(
    todaysDishes.filter((d) => d.mealType === 'main').map((d) => d.mainProtein),
  );

  const scored = candidates.map((dish) => {
    let score = request.bonus?.(dish) ?? 0;
    const reasons: ReasonCode[] = [];
    if (!snack) {
      const groups = groupsOf(dish, ctx);
      const missing = FOUR_GROUPS.filter((g) => !groups.has(g)).length;
      score += missing === 0 ? 30 : -10 * missing;
      if (missing === 0) reasons.push('FOUR_GROUPS');
      if (!todaysProteins.has(dish.mainProtein)) {
        score += 25;
        reasons.push('DIFFERENT_PROTEIN');
      }
      const leastUsed = 15 * (1 - (proteinUses.get(dish.mainProtein!) ?? 0) / maxProteinUses);
      score += leastUsed;
      if (leastUsed === 15) reasons.push('LEAST_USED_PROTEIN');
    }
    if (isLiked(ctx, dish.id)) {
      score += 15;
      reasons.push('LIKED');
    }
    if (!notRecent.has(dish.id)) {
      score += 10;
      reasons.push('NOT_USED_7D');
    }
    const firstTries = newIngredientIds(dish, ctx);
    if (firstTries.length > 0) {
      score += 8;
      reasons.push('NEW_INGREDIENT');
    }
    return {
      dish,
      score,
      reasons,
      firstTries,
      tie: hash(`${ctx.childId}|${date}|${slot}|${dish.id}`),
    };
  });
  scored.sort((a, b) => b.score - a.score || a.tie - b.tie);
  return { ranked: scored.map(({ tie: _tie, ...rest }) => rest), relaxed };
}

export function generateDay(ctx: PlanningContext, request: DayRequest): DayGeneration {
  const uses = [...request.history];
  const meals: PlannedDraft[] = [];
  const unfilled: ScheduledSlot[] = [];
  let relaxedWindowDays: 3 | null = null;
  const safe = offered(ctx.dishes).filter((d) => exclusionReason(d, ctx, request.date) === null);

  for (const slot of request.slots) {
    const { ranked, relaxed } = rankSlot(ctx, safe, {
      date: request.date,
      slot: slot.slot,
      uses,
      allergenIntroductions: request.allergenIntroductions,
    });
    if (relaxed) relaxedWindowDays = RELAXED_WINDOW_DAYS;
    const best = ranked[0];
    if (!best) {
      unfilled.push(slot);
      continue;
    }
    const variant = variantFor(best.dish, ctx.stage);
    meals.push({
      slot: slot.slot,
      time: slot.time,
      dishId: best.dish.id,
      texture: variant.texture,
      portionText: variant.portionText,
      newIngredientIds: best.firstTries,
      newAllergenIds: newAllergenIds(best.dish, ctx),
      reasons: best.reasons,
    });
    uses.push({ date: request.date, slot: slot.slot, dishId: best.dish.id });
  }

  return { meals, unfilled, relaxedWindowDays };
}
