import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import { APP_TIMEZONE, addDays, toLocalDate } from '../../../../shared/kernel/local-date.js';
import { PlanChildNotFoundError } from '../../domain/errors.js';
import { foodProgress, type FoodProgress } from '../../domain/food-progress.js';
import {
  CHILD_PLANNING_READER,
  type ChildPlanningReader,
} from '../ports/out/child-planning.reader.js';
import { FOOD_HISTORY_READER, type FoodHistoryReader } from '../ports/out/food-history.reader.js';
import {
  MEAL_PLAN_REPOSITORY,
  type MealPlanRepository,
} from '../ports/out/meal-plan.repository.js';
import { PLAN_AHEAD_DAYS } from './day-plan.service.js';
import { PlanningDishes } from './planning-dishes.js';

/** UC-26 / G16: the foods the child has tried, is avoiding, and will try next (FR-145/146). */
@Injectable()
export class FoodProgressService {
  constructor(
    @Inject(CHILD_PLANNING_READER) private readonly children: ChildPlanningReader,
    @Inject(PlanningDishes) private readonly catalog: PlanningDishes,
    @Inject(FOOD_HISTORY_READER) private readonly history: FoodHistoryReader,
    @Inject(MEAL_PLAN_REPOSITORY) private readonly plans: MealPlanRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async get(userId: string, childId: string): Promise<FoodProgress> {
    const child = await this.children.find(childId, userId);
    if (!child) throw new PlanChildNotFoundError();
    const today = toLocalDate(this.clock.now(), APP_TIMEZONE);
    const [ingredients, tried, paused, upcoming] = await Promise.all([
      this.catalog.ingredients(),
      this.history.tried(childId),
      this.history.paused(childId),
      this.plans.findBetween(childId, today, addDays(today, PLAN_AHEAD_DAYS)),
    ]);
    return foodProgress({
      ageMonths: child.ageMonths,
      ingredients,
      avoidAllergens: new Set(child.avoidAllergens),
      avoidIngredients: new Set(child.avoidIngredients),
      tried,
      paused,
      upcoming: upcoming.filter((m) => m.isPending),
    });
  }
}
