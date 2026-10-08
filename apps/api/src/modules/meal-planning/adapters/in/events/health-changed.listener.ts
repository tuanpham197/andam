import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  EVENT_BUS,
  type DomainEvent,
  type EventBus,
} from '../../../../../shared/kernel/event-bus.port.js';
import { RegenerateFutureService } from '../../../application/use-cases/regenerate-future.service.js';

/** Driving adapter: a health update re-plans the upcoming meals in the same transaction (BR-31). */
@Injectable()
export class HealthChangedListener implements OnModuleInit {
  constructor(
    @Inject(EVENT_BUS) private readonly events: EventBus,
    @Inject(RegenerateFutureService) private readonly regenerate: RegenerateFutureService,
  ) {}

  onModuleInit(): void {
    // The payload shape is the child-health module's HealthChangedEvent.
    this.events.subscribe('HealthChanged', (event) =>
      this.regenerate.execute(event as DomainEvent & { childId: string; userId: string }),
    );
  }
}
