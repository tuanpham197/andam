import type { UrgentEvent } from '../../../domain/urgent-event.js';

export const URGENT_EVENT_REPOSITORY = Symbol('URGENT_EVENT_REPOSITORY');

export interface UrgentEventRepository {
  add(event: UrgentEvent): Promise<void>;
  find(eventId: string): Promise<UrgentEvent | null>;
  save(event: UrgentEvent): Promise<void>;
}
