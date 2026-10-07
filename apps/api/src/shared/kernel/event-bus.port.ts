export const EVENT_BUS = Symbol('EVENT_BUS');

/** Events extend this with their own payload fields. */
export interface DomainEvent {
  type: string;
}

export type EventHandler = (event: DomainEvent) => Promise<void>;

/** In-process, synchronous: `publish` resolves once every handler has finished. */
export interface EventBus {
  publish<E extends DomainEvent>(event: E): Promise<void>;
  subscribe(type: string, handler: EventHandler): void;
}
