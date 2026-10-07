import type { Clock } from '../../src/shared/kernel/clock.port.js';
import type {
  DomainEvent,
  EventBus,
  EventHandler,
} from '../../src/shared/kernel/event-bus.port.js';
import type { IdGenerator } from '../../src/shared/kernel/id-generator.port.js';
import type { UnitOfWork } from '../../src/shared/kernel/unit-of-work.port.js';

export class FixedClock implements Clock {
  constructor(private current = new Date('2026-09-24T02:00:00Z')) {}
  now(): Date {
    return new Date(this.current);
  }
  set(date: Date | string): void {
    this.current = new Date(date);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class SequenceIds implements IdGenerator {
  private n = 0;
  next(): string {
    this.n += 1;
    return `00000000-0000-4000-8000-${String(this.n).padStart(12, '0')}`;
  }
}

/** In-memory store whose state can be captured and put back, like a database transaction. */
export interface Snapshotable {
  snapshot(): unknown;
  restore(snapshot: unknown): void;
}

/**
 * Behaves like a real transaction: when `work` throws, every registered store is rolled back.
 * Without this, a fake would hide bugs such as "revoke inside a transaction, then throw".
 */
export class ImmediateUnitOfWork implements UnitOfWork {
  runs = 0;
  private readonly stores: Snapshotable[] = [];

  track(...stores: Snapshotable[]): this {
    this.stores.push(...stores);
    return this;
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.runs += 1;
    const snapshots = this.stores.map((store) => store.snapshot());
    try {
      return await work();
    } catch (error) {
      this.stores.forEach((store, i) => store.restore(snapshots[i]));
      throw error;
    }
  }
}

export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;

/** Records published events and still runs subscribers, like the in-process bus. */
export class RecordingEventBus implements EventBus {
  readonly published: DomainEvent[] = [];
  private readonly handlers = new Map<string, EventHandler[]>();
  subscribe(type: string, handler: EventHandler): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }
  async publish<E extends DomainEvent>(event: E): Promise<void> {
    this.published.push(event);
    for (const handler of this.handlers.get(event.type) ?? []) await handler(event);
  }
}
