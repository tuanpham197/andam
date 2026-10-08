import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  EVENT_BUS,
  type DomainEvent,
  type EventBus,
} from '../../../../../shared/kernel/event-bus.port.js';
import { RegenerateFutureService } from '../../../application/use-cases/regenerate-future.service.js';

type ChildEvent = DomainEvent & { childId: string; userId: string; sourceMealId?: string | null };

/**
 * Driving adapter for the safety module's events (shapes owned there, not importable here):
 * a paused food leaves every upcoming meal at once (UC-17); a resumed one may come back (UC-14).
 * Handlers run inside the publisher's transaction.
 */
@Injectable()
export class SafetyChangedListener implements OnModuleInit {
  constructor(
    @Inject(EVENT_BUS) private readonly events: EventBus,
    @Inject(RegenerateFutureService) private readonly regenerate: RegenerateFutureService,
  ) {}

  onModuleInit(): void {
    this.events.subscribe('IngredientsPaused', (event) => {
      const { childId, userId, sourceMealId } = event as ChildEvent;
      return this.regenerate.execute({
        childId,
        userId,
        scope: 'unsafe',
        keepMealId: sourceMealId,
      });
    });
    this.events.subscribe('IngredientResumed', (event) => {
      const { childId, userId } = event as ChildEvent;
      return this.regenerate.execute({ childId, userId, scope: 'all' });
    });
  }
}
