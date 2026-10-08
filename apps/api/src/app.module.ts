import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { ChildHealthModule } from './modules/child-health/child-health.module.js';
import { ChildProfileModule } from './modules/child-profile/child-profile.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { MealLogModule } from './modules/meal-log/meal-log.module.js';
import { MealPlanningModule } from './modules/meal-planning/meal-planning.module.js';
import { SafetyModule } from './modules/safety/safety.module.js';
import { AuthGuard } from './shared/auth/auth.guard.js';
import { ConfigModule, ENV } from './shared/infrastructure/config/config.module.js';
import type { Env } from './shared/infrastructure/config/env.js';
import { serializeRequest } from './shared/infrastructure/http/log-redaction.js';
import { throttlerOptions } from './shared/infrastructure/http/rate-limit.js';
import { KernelModule } from './shared/infrastructure/kernel/kernel.module.js';
import { PersistenceModule } from './shared/infrastructure/persistence/persistence.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          // Health data and credentials never reach the logs (docs §7.9).
          redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
          serializers: { req: serializeRequest },
        },
      }),
    }),
    ThrottlerModule.forRootAsync({ inject: [ENV], useFactory: throttlerOptions }),
    KernelModule,
    PersistenceModule,
    HealthModule,
    IdentityModule,
    CatalogModule,
    ChildProfileModule,
    ChildHealthModule,
    MealPlanningModule,
    SafetyModule,
    MealLogModule,
  ],
  providers: [
    // Order matters: rate limiting runs before authentication.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
