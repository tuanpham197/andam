import { Injectable } from '@nestjs/common';
import type { DomainEvent, EventBus, EventHandler } from '../../kernel/event-bus.port.js';

@Injectable()
export class InProcessEventBus implements EventBus {
  private readonly handlers = new Map<string, EventHandler[]>();

  subscribe(type: string, handler: EventHandler): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }

  async publish<E extends DomainEvent>(event: E): Promise<void> {
    for (const handler of this.handlers.get(event.type) ?? []) await handler(event);
  }
}
