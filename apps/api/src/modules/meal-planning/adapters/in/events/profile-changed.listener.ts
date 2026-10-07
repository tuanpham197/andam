import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  EVENT_BUS,
  type DomainEvent,
  type EventBus,
} from '../../../../../shared/kernel/event-bus.port.js';
import { RegenerateFutureService } from '../../../application/use-cases/regenerate-future.service.js';

/** Driving adapter: a profile change upstream refreshes the upcoming meals (BR-31). */
@Injectable()
export class ProfileChangedListener implements OnModuleInit {
  constructor(
    @Inject(EVENT_BUS) private readonly events: EventBus,
    @Inject(RegenerateFutureService) private readonly regenerate: RegenerateFutureService,
  ) {}

  onModuleInit(): void {
    // The payload shape is the child-profile module's ProfileChangedEvent (not importable here).
    this.events.subscribe('ProfileChanged', (event) =>
      this.regenerate.execute(event as DomainEvent & { childId: string; userId: string }),
    );
  }
}
