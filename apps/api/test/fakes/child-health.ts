import type { ChildOwnership } from '../../src/modules/child-health/application/ports/out/child-ownership.port.js';
import type { HealthEpisodeRepository } from '../../src/modules/child-health/application/ports/out/health-episode.repository.js';
import {
  ChildHealthQueries,
  ChildHealthService,
} from '../../src/modules/child-health/application/use-cases/child-health.service.js';
import { HealthEpisode } from '../../src/modules/child-health/domain/health-episode.js';
import {
  FixedClock,
  ImmediateUnitOfWork,
  RecordingEventBus,
  SequenceIds,
  type Snapshotable,
} from './kernel.js';

const copy = (e: HealthEpisode) =>
  HealthEpisode.restore({
    id: e.id,
    childId: e.childId,
    status: e.status,
    symptoms: e.symptoms,
    startDate: e.startDate,
    expectedEndDate: e.expectedEndDate,
    endedAt: e.endedAt,
    createdAt: e.createdAt,
  });

export class InMemoryHealthEpisodes implements HealthEpisodeRepository, Snapshotable {
  rows: HealthEpisode[] = [];
  async findOpen(childId: string) {
    const open = this.rows.filter((e) => e.childId === childId && e.endedAt === null);
    return open.length > 0 ? copy(open[open.length - 1]!) : null;
  }
  async save(episode: HealthEpisode) {
    this.rows = [...this.rows.filter((e) => e.id !== episode.id), copy(episode)];
  }
  snapshot() {
    return this.rows.map(copy);
  }
  restore(state: unknown) {
    this.rows = state as HealthEpisode[];
  }
}

export class FakeOwnership implements ChildOwnership {
  readonly owners = new Map<string, string>();
  async nameOf(childId: string, userId: string) {
    return this.owners.get(childId) === userId ? 'Na' : null;
  }
}

export const HEALTH_USER = 'u-1';
export const HEALTH_CHILD = 'c-1';

export function childHealthTestbed() {
  // 09:00 in Vietnam on 24/09/2026.
  const clock = new FixedClock(new Date('2026-09-24T02:00:00Z'));
  const episodes = new InMemoryHealthEpisodes();
  const ownership = new FakeOwnership();
  ownership.owners.set(HEALTH_CHILD, HEALTH_USER);
  const events = new RecordingEventBus();
  const uow = new ImmediateUnitOfWork().track(episodes);
  return {
    clock,
    episodes,
    events,
    uow,
    service: new ChildHealthService(episodes, ownership, new SequenceIds(), clock, events, uow),
    queries: new ChildHealthQueries(episodes),
  };
}
