import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ChildProfileModule } from '../child-profile/child-profile.module.js';
import { ProfileChangedListener } from './adapters/in/events/profile-changed.listener.js';
import { SafetyChangedListener } from './adapters/in/events/safety-changed.listener.js';
import { MealPlanningController } from './adapters/in/http/meal-planning.controller.js';
import { CatalogPlanningAdapter } from './adapters/out/cross-module/catalog-planning.adapter.js';
import { ChildPlanningAdapter } from './adapters/out/cross-module/child-planning.adapter.js';
import { PrismaCustomDishRepository } from './adapters/out/persistence/prisma-custom-dish.repository.js';
import { PrismaFoodHistoryReader } from './adapters/out/persistence/prisma-food-history.reader.js';
import { PrismaMealPlanRepository } from './adapters/out/persistence/prisma-meal-plan.repository.js';
import { CHILD_PLANNING_READER } from './application/ports/out/child-planning.reader.js';
import { CUSTOM_DISH_REPOSITORY } from './application/ports/out/custom-dish.repository.js';
import { FOOD_HISTORY_READER } from './application/ports/out/food-history.reader.js';
import { MEAL_PLAN_REPOSITORY } from './application/ports/out/meal-plan.repository.js';
import { PLANNING_CATALOG } from './application/ports/out/planning-catalog.port.js';
import { CustomDishService } from './application/use-cases/custom-dish.service.js';
import { DayPlanService } from './application/use-cases/day-plan.service.js';
import { LibraryService } from './application/use-cases/library.service.js';
import { MealAccessService } from './application/use-cases/meal-access.service.js';
import { PlanningDishes } from './application/use-cases/planning-dishes.js';
import { RecipeService } from './application/use-cases/recipe.service.js';
import { RegenerateFutureService } from './application/use-cases/regenerate-future.service.js';
import { SwapService } from './application/use-cases/swap.service.js';

const ports = [
  { provide: MEAL_PLAN_REPOSITORY, useClass: PrismaMealPlanRepository },
  { provide: FOOD_HISTORY_READER, useClass: PrismaFoodHistoryReader },
  { provide: CHILD_PLANNING_READER, useClass: ChildPlanningAdapter },
  { provide: PLANNING_CATALOG, useClass: CatalogPlanningAdapter },
  { provide: CUSTOM_DISH_REPOSITORY, useClass: PrismaCustomDishRepository },
];

@Module({
  imports: [ChildProfileModule, CatalogModule],
  controllers: [MealPlanningController],
  providers: [
    ...ports,
    PlanningDishes,
    DayPlanService,
    RecipeService,
    RegenerateFutureService,
    SwapService,
    LibraryService,
    CustomDishService,
    MealAccessService,
    ProfileChangedListener,
    SafetyChangedListener,
  ],
  // MealAccessService: the meal-log and safety modules reach planned meals only through it.
  exports: [...ports.map((p) => p.provide), MealAccessService],
})
export class MealPlanningModule {}
