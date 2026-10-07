import type { LocalDate } from '../../../shared/kernel/local-date.js';
import { MealAlreadyLoggedError, SameDishError } from './errors.js';
import type { PlannedDraft } from './menu-engine.js';
import type { MealSlot, StageId, Texture } from './model.js';

export type MealStatus = 'planned' | 'prepared' | 'eaten' | 'refused' | 'skipped';
export type PlanSource = 'auto' | 'swap' | 'manual';

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
      generatedAt: input.generatedAt,
    });
  }

  static restore(state: PlannedMealState): PlannedMeal {
    return new PlannedMeal({ ...state });
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

  /** Same dish, served for the child's current stage and health (BR-50..53). */
  reserve(serving: { texture: Texture; portionText: string }): void {
    if (this.isLogged) throw new MealAlreadyLoggedError();
    Object.assign(this.state, serving);
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
    Object.assign(this.state, target, { source: 'swap', status: 'planned' });
  }
}
