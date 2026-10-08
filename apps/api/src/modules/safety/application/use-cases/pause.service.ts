import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import {
  EVENT_BUS,
  type DomainEvent,
  type EventBus,
} from '../../../../shared/kernel/event-bus.port.js';
import { ID_GENERATOR, type IdGenerator } from '../../../../shared/kernel/id-generator.port.js';
import type { PauseReason } from '../../domain/model.js';
import { notYetPaused } from '../../domain/urgent-event.js';
import {
  PAUSED_INGREDIENT_REPOSITORY,
  type PausedIngredientRepository,
} from '../ports/out/paused-ingredient.repository.js';
import { SAFETY_CONTEXT, type SafetyContext } from '../ports/out/safety-context.port.js';

export const INGREDIENTS_PAUSED = 'IngredientsPaused';
export const INGREDIENT_RESUMED = 'IngredientResumed';

/** Upcoming meals must drop these foods at once (UC-17); handled inside the same transaction. */
export interface IngredientsPausedEvent extends DomainEvent {
  childId: string;
  userId: string;
  ingredientIds: string[];
  /** The meal the child reacted to: it is being eaten, so it must not be replaced. */
  sourceMealId: string | null;
}

export interface IngredientResumedEvent extends DomainEvent {
  childId: string;
  userId: string;
  ingredientId: string;
}

export interface NamedIngredient {
  id: string;
  name: string;
}

/** UC-17: pauses suspected foods. Runs inside the caller's unit of work (log or urgent event). */
@Injectable()
export class PauseService {
  constructor(
    @Inject(PAUSED_INGREDIENT_REPOSITORY) private readonly pauses: PausedIngredientRepository,
    @Inject(SAFETY_CONTEXT) private readonly context: SafetyContext,
    @Inject(EVENT_BUS) private readonly events: EventBus,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Returns every requested food, now paused — including those that already were. */
  async pause(input: {
    userId: string;
    childId: string;
    ingredientIds: string[];
    reason: PauseReason;
    sourceLogId?: string;
    sourceUrgentId?: string;
    sourceMealId?: string | null;
  }): Promise<NamedIngredient[]> {
    const requested = [...new Set(input.ingredientIds)];
    if (requested.length === 0) return [];
    const fresh = notYetPaused(requested, await this.pauses.activeIds(input.childId));
    if (fresh.length > 0) {
      const now = this.clock.now();
      await this.pauses.add(
        fresh.map((ingredientId) => ({
          id: this.ids.next(),
          childId: input.childId,
          ingredientId,
          reason: input.reason,
          sourceLogId: input.sourceLogId ?? null,
          sourceUrgentId: input.sourceUrgentId ?? null,
          pausedAt: now,
        })),
      );
      await this.events.publish<IngredientsPausedEvent>({
        type: INGREDIENTS_PAUSED,
        childId: input.childId,
        userId: input.userId,
        ingredientIds: fresh,
        sourceMealId: input.sourceMealId ?? null,
      });
    }
    const names = await this.context.ingredientNames(requested);
    return requested.map((id) => ({ id, name: names.get(id) ?? id }));
  }
}
