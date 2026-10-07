import { Module } from '@nestjs/common';
import { HealthController } from './adapters/in/http/health.controller.js';
import { PrismaDatabaseHealthAdapter } from './adapters/out/persistence/prisma-database-health.adapter.js';
import { DATABASE_HEALTH } from './application/ports/out/database-health.port.js';
import { CheckHealthService } from './application/use-cases/check-health.service.js';

@Module({
  controllers: [HealthController],
  providers: [
    CheckHealthService,
    { provide: DATABASE_HEALTH, useClass: PrismaDatabaseHealthAdapter },
  ],
})
export class HealthModule {}
