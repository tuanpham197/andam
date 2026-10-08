import { Module } from '@nestjs/common';
import { MealPlanningModule } from '../meal-planning/meal-planning.module.js';
import { SafetyModule } from '../safety/safety.module.js';
import { MealLogController } from './adapters/in/http/meal-log.controller.js';
import { LoggableMealsAdapter } from './adapters/out/cross-module/loggable-meals.adapter.js';
import { ReactionSafetyAdapter } from './adapters/out/cross-module/reaction-safety.adapter.js';
import { PrismaJournalReader } from './adapters/out/persistence/prisma-journal.reader.js';
import { PrismaMealLogRepository } from './adapters/out/persistence/prisma-meal-log.repository.js';
import { JOURNAL_READER } from './application/ports/out/journal.reader.js';
import { LOGGABLE_MEALS } from './application/ports/out/loggable-meals.port.js';
import { MEAL_LOG_REPOSITORY } from './application/ports/out/meal-log.repository.js';
import { REACTION_SAFETY } from './application/ports/out/reaction-safety.port.js';
import { JournalService } from './application/use-cases/journal.service.js';
import { LogMealService } from './application/use-cases/log-meal.service.js';

@Module({
  imports: [MealPlanningModule, SafetyModule],
  controllers: [MealLogController],
  providers: [
    { provide: MEAL_LOG_REPOSITORY, useClass: PrismaMealLogRepository },
    { provide: JOURNAL_READER, useClass: PrismaJournalReader },
    { provide: LOGGABLE_MEALS, useClass: LoggableMealsAdapter },
    { provide: REACTION_SAFETY, useClass: ReactionSafetyAdapter },
    LogMealService,
    JournalService,
  ],
})
export class MealLogModule {}
