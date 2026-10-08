import type { HealthEpisode } from '../../../domain/health-episode.js';

export const HEALTH_EPISODE_REPOSITORY = Symbol('HEALTH_EPISODE_REPOSITORY');

export interface HealthEpisodeRepository {
  /** The latest episode not ended yet, or null when the child is well. */
  findOpen(childId: string): Promise<HealthEpisode | null>;
  /** Inserts a new episode or updates an existing one. */
  save(episode: HealthEpisode): Promise<void>;
}
