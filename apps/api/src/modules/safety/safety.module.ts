import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ChildProfileModule } from '../child-profile/child-profile.module.js';
import { MealPlanningModule } from '../meal-planning/meal-planning.module.js';
import { SafetyController } from './adapters/in/http/safety.controller.js';
import { SafetyContextAdapter } from './adapters/out/cross-module/safety-context.adapter.js';
import { PrismaPausedIngredientRepository } from './adapters/out/persistence/prisma-paused-ingredient.repository.js';
import { PrismaUrgentEventRepository } from './adapters/out/persistence/prisma-urgent-event.repository.js';
import { PAUSED_INGREDIENT_REPOSITORY } from './application/ports/out/paused-ingredient.repository.js';
import { SAFETY_CONTEXT } from './application/ports/out/safety-context.port.js';
import { URGENT_EVENT_REPOSITORY } from './application/ports/out/urgent-event.repository.js';
import { PauseService } from './application/use-cases/pause.service.js';
import { PausedIngredientsService } from './application/use-cases/paused-ingredients.service.js';
import { UrgentService } from './application/use-cases/urgent.service.js';

@Module({
  imports: [ChildProfileModule, MealPlanningModule, CatalogModule],
  controllers: [SafetyController],
  providers: [
    { provide: PAUSED_INGREDIENT_REPOSITORY, useClass: PrismaPausedIngredientRepository },
    { provide: URGENT_EVENT_REPOSITORY, useClass: PrismaUrgentEventRepository },
    { provide: SAFETY_CONTEXT, useClass: SafetyContextAdapter },
    PauseService,
    UrgentService,
    PausedIngredientsService,
  ],
  // The meal-log module pauses suspected foods through PauseService (UC-17).
  exports: [PauseService],
})
export class SafetyModule {}
