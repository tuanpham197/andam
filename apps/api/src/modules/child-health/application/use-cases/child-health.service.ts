import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import {
  EVENT_BUS,
  type DomainEvent,
  type EventBus,
} from '../../../../shared/kernel/event-bus.port.js';
import { ID_GENERATOR, type IdGenerator } from '../../../../shared/kernel/id-generator.port.js';
import { APP_TIMEZONE, toLocalDate, type LocalDate } from '../../../../shared/kernel/local-date.js';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/kernel/unit-of-work.port.js';
import { HealthChildNotFoundError } from '../../domain/errors.js';
import {
  HealthEpisode,
  type HealthStatus,
  type HealthSymptom,
} from '../../domain/health-episode.js';
import { CHILD_OWNERSHIP, type ChildOwnership } from '../ports/out/child-ownership.port.js';
import {
  HEALTH_EPISODE_REPOSITORY,
  type HealthEpisodeRepository,
} from '../ports/out/health-episode.repository.js';

export const HEALTH_CHANGED = 'HealthChanged';

export interface HealthChangedEvent extends DomainEvent {
  type: typeof HEALTH_CHANGED;
  childId: string;
  userId: string;
}

export interface HealthView {
  status: HealthStatus;
  symptoms: HealthSymptom[];
  startDate: LocalDate | null;
  expectedEndDate: LocalDate | null;
  /** The expected end has passed: S01 suggests updating the status (BR-53). */
  overdue: boolean;
}

export interface HealthUpdate {
  status: HealthStatus;
  symptoms: HealthSymptom[];
  /** Defaults to today. */
  startDate?: LocalDate;
  expectedEndDate?: LocalDate | null;
}

/** UC-11: the child's health status, which the menu follows (FR-080..084). */
@Injectable()
export class ChildHealthService {
  constructor(
    @Inject(HEALTH_EPISODE_REPOSITORY) private readonly episodes: HealthEpisodeRepository,
    @Inject(CHILD_OWNERSHIP) private readonly children: ChildOwnership,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_BUS) private readonly events: EventBus,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  private today(): LocalDate {
    return toLocalDate(this.clock.now(), APP_TIMEZONE);
  }

  private async assertOwned(userId: string, childId: string): Promise<void> {
    if ((await this.children.nameOf(childId, userId)) === null)
      throw new HealthChildNotFoundError();
  }

  private view(episode: HealthEpisode | null, today: LocalDate): HealthView {
    if (!episode)
      return {
        status: 'normal',
        symptoms: [],
        startDate: null,
        expectedEndDate: null,
        overdue: false,
      };
    return {
      status: episode.status,
      symptoms: episode.symptoms,
      startDate: episode.startDate,
      expectedEndDate: episode.expectedEndDate,
      overdue: episode.isOverdue(today),
    };
  }

  async current(userId: string, childId: string): Promise<HealthView> {
    await this.assertOwned(userId, childId);
    return this.view(await this.episodes.findOpen(childId), this.today());
  }

  /**
   * Ends the open episode and starts the new one, then lets the menu follow (BR-31): both in one
   * transaction, so the upcoming meals never disagree with the stored status.
   */
  async update(userId: string, childId: string, input: HealthUpdate): Promise<HealthView> {
    await this.assertOwned(userId, childId);
    const now = this.clock.now();
    const today = toLocalDate(now, APP_TIMEZONE);
    // Validated before anything is written.
    const next =
      input.status === 'normal'
        ? null
        : HealthEpisode.start(
            {
              id: this.ids.next(),
              childId,
              status: input.status,
              symptoms: input.symptoms,
              startDate: input.startDate ?? today,
              expectedEndDate: input.expectedEndDate ?? null,
            },
            today,
            now,
          );

    return this.uow.run(async () => {
      const open = await this.episodes.findOpen(childId);
      if (!open && !next) return this.view(null, today);
      if (open) {
        open.end(now);
        await this.episodes.save(open);
      }
      if (next) await this.episodes.save(next);
      await this.events.publish<HealthChangedEvent>({ type: HEALTH_CHANGED, childId, userId });
      return this.view(next, today);
    });
  }
}

/** What other modules may ask about a child's health; no ownership check (internal use). */
@Injectable()
export class ChildHealthQueries {
  constructor(
    @Inject(HEALTH_EPISODE_REPOSITORY) private readonly episodes: HealthEpisodeRepository,
  ) {}

  async statusOn(childId: string, date: LocalDate): Promise<HealthStatus> {
    return (await this.episodes.findOpen(childId))?.statusOn(date) ?? 'normal';
  }
}
