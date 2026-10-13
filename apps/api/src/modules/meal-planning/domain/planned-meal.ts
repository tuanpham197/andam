import type { LocalDate } from '../../../shared/kernel/local-date.js';
import { MealAlreadyLoggedError, SameDishError } from './errors.js';
import { topReasons, type PlannedDraft, type ReasonCode } from './menu-engine.js';
import type { MealSlot, StageId, Texture } from './model.js';

export type MealStatus = 'planned' | 'prepared' | 'eaten' | 'refused' | 'skipped';
export type PlanSource = 'auto' | 'swap' | 'manual';

/** Why the plan changed this meal by itself (BR-94). */
export const REPLAN_CAUSES = [
  'profile',
  'health',
  'food_paused',
  'food_resumed',
  'dish_changed',
] as const;
export type ReplanCause = (typeof REPLAN_CAUSES)[number];

interface PlannedMealState {
  id: string;
  childId: string;
  date: LocalDate;
  slot: MealSlot;
  time: string;
  dishId: string;
  stageId: StageId;
  texture: Texture;
  portionText: string;
  status: MealStatus;
  newIngredientIds: string[];
  source: PlanSource;
  /** Why the engine chose the dish (BR-93); empty when the parent chose it. */
  reasons: ReasonCode[];
  replanCause: ReplanCause | null;
  generatedAt: Date;
}

export class PlannedMeal {
  private constructor(private state: PlannedMealState) {}

  static plan(input: {
    id: string;
    childId: string;
    date: LocalDate;
    stageId: StageId;
    generatedAt: Date;
    draft: PlannedDraft;
    replanCause?: ReplanCause | null;
  }): PlannedMeal {
    const { draft } = input;
    return new PlannedMeal({
      id: input.id,
      childId: input.childId,
      date: input.date,
      slot: draft.slot,
      time: draft.time,
      dishId: draft.dishId,
      stageId: input.stageId,
      texture: draft.texture,
      portionText: draft.portionText,
      status: 'planned',
      newIngredientIds: draft.newIngredientIds,
      source: 'auto',
      reasons: topReasons(draft.reasons),
      replanCause: input.replanCause ?? null,
      generatedAt: input.generatedAt,
    });
  }

  /** Rows written before P8a carry neither reasons nor a cause. */
  static restore(
    state: Omit<PlannedMealState, 'reasons' | 'replanCause'> &
      Partial<Pick<PlannedMealState, 'reasons' | 'replanCause'>>,
  ): PlannedMeal {
    return new PlannedMeal({
      ...state,
      reasons: [...(state.reasons ?? [])],
      replanCause: state.replanCause ?? null,
    });
  }

  get id() {
    return this.state.id;
  }
  get childId() {
    return this.state.childId;
  }
  get date() {
    return this.state.date;
  }
  get slot() {
    return this.state.slot;
  }
  get time() {
    return this.state.time;
  }
  get dishId() {
    return this.state.dishId;
  }
  get stageId() {
    return this.state.stageId;
  }
  get texture() {
    return this.state.texture;
  }
  get portionText() {
    return this.state.portionText;
  }
  get status() {
    return this.state.status;
  }
  get newIngredientIds() {
    return this.state.newIngredientIds;
  }
  get source() {
    return this.state.source;
  }
  get reasons() {
    return this.state.reasons;
  }
  get replanCause() {
    return this.state.replanCause;
  }
  get generatedAt() {
    return this.state.generatedAt;
  }
  get isPending() {
    return this.state.status === 'planned' || this.state.status === 'prepared';
  }

  private get isLogged() {
    return this.state.status === 'eaten' || this.state.status === 'refused';
  }

  markPrepared(): void {
    if (this.isLogged) throw new MealAlreadyLoggedError();
    this.state.status = 'prepared';
  }

  /** UC-08: logging closes the meal; "Không ăn" marks it refused. */
  markLogged(outcome: 'eaten' | 'refused'): void {
    if (!this.isPending) throw new MealAlreadyLoggedError();
    this.state.status = outcome;
  }

  /** BR-86: after a "Món của bạn" is edited, its first tries are worked out again. */
  updateNewIngredients(ids: string[]): void {
    this.state.newIngredientIds = [...ids];
  }

  /** Same dish, served for the child's current stage and health (BR-50..53). */
  reserve(
    serving: { texture: Texture; portionText: string },
    cause: ReplanCause | null = null,
  ): void {
    if (this.isLogged) throw new MealAlreadyLoggedError();
    Object.assign(this.state, serving);
    if (cause) this.state.replanCause = cause;
  }

  /** FR-045: the caller has checked the dish is safe and fits the slot. */
  swapTo(target: {
    dishId: string;
    texture: Texture;
    portionText: string;
    newIngredientIds: string[];
  }): void {
    if (this.isLogged) throw new MealAlreadyLoggedError();
    if (target.dishId === this.state.dishId) throw new SameDishError();
    // The parent's own choice: no engine reasons, no pending notice (BR-93/94).
    Object.assign(this.state, target, {
      source: 'swap',
      status: 'planned',
      reasons: [],
      replanCause: null,
    });
  }
}
