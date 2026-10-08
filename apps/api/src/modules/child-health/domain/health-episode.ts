import { addDays, isValidLocalDate, type LocalDate } from '../../../shared/kernel/local-date.js';
import {
  HealthEndBeforeStartError,
  HealthStartTooFarError,
  InvalidHealthDateError,
} from './errors.js';

export const HEALTH_STATUSES = ['normal', 'sick', 'recovering'] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];
export const HEALTH_SYMPTOMS = [
  'fever',
  'poor_appetite',
  'cough',
  'diarrhea',
  'vomit',
  'teething',
] as const;
export type HealthSymptom = (typeof HEALTH_SYMPTOMS)[number];

/** A start date may be planned ahead, but not further than a week (TC-HLT-011). */
const MAX_START_AHEAD_DAYS = 7;

interface HealthEpisodeState {
  id: string;
  childId: string;
  status: Exclude<HealthStatus, 'normal'>;
  symptoms: HealthSymptom[];
  startDate: LocalDate;
  expectedEndDate: LocalDate | null;
  endedAt: Date | null;
  createdAt: Date;
  /** Who reported it (BR-80); null once that account is deleted. */
  actorId: string | null;
}

/** A period of illness or recovery (UC-11). "Bình thường" is the absence of an open episode. */
export class HealthEpisode {
  private constructor(private state: HealthEpisodeState) {}

  static start(
    input: {
      id: string;
      childId: string;
      status: Exclude<HealthStatus, 'normal'>;
      symptoms: HealthSymptom[];
      startDate: LocalDate;
      expectedEndDate: LocalDate | null;
      actorId: string | null;
    },
    today: LocalDate,
    now: Date,
  ): HealthEpisode {
    const { startDate, expectedEndDate } = input;
    if (!isValidLocalDate(startDate)) throw new InvalidHealthDateError();
    if (expectedEndDate !== null && !isValidLocalDate(expectedEndDate))
      throw new InvalidHealthDateError();
    if (startDate > addDays(today, MAX_START_AHEAD_DAYS)) throw new HealthStartTooFarError();
    if (expectedEndDate !== null && expectedEndDate < startDate)
      throw new HealthEndBeforeStartError();
    return new HealthEpisode({
      ...input,
      symptoms: HEALTH_SYMPTOMS.filter((s) => input.symptoms.includes(s)),
      endedAt: null,
      createdAt: now,
    });
  }

  static restore(state: HealthEpisodeState): HealthEpisode {
    return new HealthEpisode({ ...state, symptoms: [...state.symptoms] });
  }

  get id() {
    return this.state.id;
  }
  get childId() {
    return this.state.childId;
  }
  get status() {
    return this.state.status;
  }
  get symptoms() {
    return this.state.symptoms;
  }
  get startDate() {
    return this.state.startDate;
  }
  get expectedEndDate() {
    return this.state.expectedEndDate;
  }
  get endedAt() {
    return this.state.endedAt;
  }
  get createdAt() {
    return this.state.createdAt;
  }
  get actorId() {
    return this.state.actorId;
  }

  end(now: Date): void {
    this.state.endedAt ??= now;
  }

  /**
   * Status the menu follows on `date`: the episode from its start to its expected end (FR-082).
   * Days after the expected end are planned as normal; the parent is only nudged (BR-53).
   */
  statusOn(date: LocalDate): HealthStatus {
    if (this.state.endedAt !== null || date < this.state.startDate) return 'normal';
    if (this.state.expectedEndDate !== null && date > this.state.expectedEndDate) return 'normal';
    return this.state.status;
  }

  /** The expected end has passed while the episode is still open (TC-HLT-009). */
  isOverdue(today: LocalDate): boolean {
    return (
      this.state.endedAt === null &&
      this.state.expectedEndDate !== null &&
      today > this.state.expectedEndDate
    );
  }
}
