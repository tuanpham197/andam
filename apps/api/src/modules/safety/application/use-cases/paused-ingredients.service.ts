import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import { EVENT_BUS, type EventBus } from '../../../../shared/kernel/event-bus.port.js';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/kernel/unit-of-work.port.js';
import {
  IngredientNotPausedError,
  SafetyChildNotFoundError,
  SafetyOwnerOnlyError,
} from '../../domain/errors.js';
import {
  PAUSED_INGREDIENT_REPOSITORY,
  type ActivePause,
  type PausedIngredientRepository,
} from '../ports/out/paused-ingredient.repository.js';
import { SAFETY_CONTEXT, type SafetyContext } from '../ports/out/safety-context.port.js';
import { INGREDIENT_RESUMED, type IngredientResumedEvent } from './pause.service.js';

/** G08: foods paused for the child, and "Bác sĩ đã cho phép dùng lại" (UC-14, BR-42). */
@Injectable()
export class PausedIngredientsService {
  constructor(
    @Inject(PAUSED_INGREDIENT_REPOSITORY) private readonly pauses: PausedIngredientRepository,
    @Inject(SAFETY_CONTEXT) private readonly context: SafetyContext,
    @Inject(EVENT_BUS) private readonly events: EventBus,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  private async role(userId: string, childId: string): Promise<'owner' | 'caregiver'> {
    const role = await this.context.roleOf(userId, childId);
    if (!role) throw new SafetyChildNotFoundError();
    return role;
  }

  async list(userId: string, childId: string): Promise<ActivePause[]> {
    await this.role(userId, childId);
    return this.pauses.listActive(childId);
  }

  /** Only a deliberate confirmation brings a food back; upcoming meals may then use it again. */
  async resume(userId: string, childId: string, ingredientId: string): Promise<void> {
    // BR-73: only the owner brings a paused food back (Q14).
    if ((await this.role(userId, childId)) !== 'owner') throw new SafetyOwnerOnlyError();
    await this.uow.run(async () => {
      if (!(await this.pauses.resume(childId, ingredientId, this.clock.now(), userId))) {
        throw new IngredientNotPausedError();
      }
      await this.events.publish<IngredientResumedEvent>({
        type: INGREDIENT_RESUMED,
        childId,
        userId,
        ingredientId,
      });
    });
  }
}
