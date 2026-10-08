import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import { ID_GENERATOR, type IdGenerator } from '../../../../shared/kernel/id-generator.port.js';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/kernel/unit-of-work.port.js';
import {
  SafetyChildNotFoundError,
  SafetyMealNotFoundError,
  UrgentEventNotFoundError,
} from '../../domain/errors.js';
import { UrgentEvent, urgentSuspectIds } from '../../domain/urgent-event.js';
import { SAFETY_CONTEXT, type SafetyContext } from '../ports/out/safety-context.port.js';
import {
  URGENT_EVENT_REPOSITORY,
  type UrgentEventRepository,
} from '../ports/out/urgent-event.repository.js';
import { PauseService, type NamedIngredient } from './pause.service.js';

export interface UrgentEventView {
  id: string;
  mealId: string | null;
  openedAt: Date;
  contactedMedicalAt: Date | null;
  pausedIngredients: NamedIngredient[];
}

/** UC-10 "Dấu hiệu nguy hiểm": recorded for the doctor, related foods paused at once (BR-41). */
@Injectable()
export class UrgentService {
  constructor(
    @Inject(URGENT_EVENT_REPOSITORY) private readonly events: UrgentEventRepository,
    @Inject(SAFETY_CONTEXT) private readonly context: SafetyContext,
    @Inject(PauseService) private readonly pauses: PauseService,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  async open(userId: string, childId: string, mealId: string | null): Promise<UrgentEventView> {
    if (!(await this.context.roleOf(userId, childId))) throw new SafetyChildNotFoundError();
    const meal = mealId === null ? null : await this.context.meal(userId, mealId);
    if (mealId !== null && meal?.childId !== childId) throw new SafetyMealNotFoundError();

    const event = UrgentEvent.open({
      id: this.ids.next(),
      childId,
      mealId,
      openedAt: this.clock.now(),
      actorId: userId,
    });
    return this.uow.run(async () => {
      await this.events.add(event);
      const paused = await this.pauses.pause({
        userId,
        childId,
        ingredientIds: urgentSuspectIds(meal),
        reason: 'urgent',
        sourceUrgentId: event.id,
        sourceMealId: mealId,
      });
      return this.view(event, paused);
    });
  }

  /** FR-067: "Tôi đã liên hệ nhân viên y tế". */
  async markContactedMedical(userId: string, eventId: string): Promise<UrgentEventView> {
    const event = await this.events.find(eventId);
    if (!event || !(await this.context.roleOf(userId, event.childId))) {
      throw new UrgentEventNotFoundError();
    }
    event.markContactedMedical(this.clock.now());
    await this.events.save(event);
    return this.view(event, []);
  }

  private view(event: UrgentEvent, paused: NamedIngredient[]): UrgentEventView {
    return {
      id: event.id,
      mealId: event.mealId,
      openedAt: event.openedAt,
      contactedMedicalAt: event.contactedMedicalAt,
      pausedIngredients: paused,
    };
  }
}
