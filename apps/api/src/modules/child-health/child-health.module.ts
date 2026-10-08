import { Module } from '@nestjs/common';
import { ChildProfileModule } from '../child-profile/child-profile.module.js';
import { ChildHealthController } from './adapters/in/http/child-health.controller.js';
import { ChildProfileOwnershipAdapter } from './adapters/out/cross-module/child-profile-ownership.adapter.js';
import { PrismaHealthEpisodeRepository } from './adapters/out/persistence/prisma-health-episode.repository.js';
import { CHILD_OWNERSHIP } from './application/ports/out/child-ownership.port.js';
import { HEALTH_EPISODE_REPOSITORY } from './application/ports/out/health-episode.repository.js';
import {
  ChildHealthQueries,
  ChildHealthService,
} from './application/use-cases/child-health.service.js';

/** The child's health episodes (docs §7.4.2 `health`; named apart from the server health check). */
@Module({
  imports: [ChildProfileModule],
  controllers: [ChildHealthController],
  providers: [
    ChildHealthService,
    ChildHealthQueries,
    { provide: HEALTH_EPISODE_REPOSITORY, useClass: PrismaHealthEpisodeRepository },
    { provide: CHILD_OWNERSHIP, useClass: ChildProfileOwnershipAdapter },
  ],
  exports: [ChildHealthQueries],
})
export class ChildHealthModule {}
