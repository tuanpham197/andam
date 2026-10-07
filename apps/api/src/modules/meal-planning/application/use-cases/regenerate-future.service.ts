import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import { ID_GENERATOR, type IdGenerator } from '../../../../shared/kernel/id-generator.port.js';
import {
  APP_TIMEZONE,
  addDays,
  toLocalDate,
  toLocalTime,
} from '../../../../shared/kernel/local-date.js';
import { generateDay, slotsForDay } from '../../domain/menu-engine.js';
import { PlannedMeal } from '../../domain/planned-meal.js';
import { exclusionReason } from '../../domain/safety-filter.js';
import {
  CHILD_PLANNING_READER,
  type ChildPlanningReader,
} from '../ports/out/child-planning.reader.js';
import { FOOD_HISTORY_READER, type FoodHistoryReader } from '../ports/out/food-history.reader.js';
import {
  MEAL_PLAN_REPOSITORY,
  type MealPlanRepository,
} from '../ports/out/meal-plan.repository.js';
import { PLANNING_CATALOG, type PlanningCatalog } from '../ports/out/planning-catalog.port.js';
import { PLAN_AHEAD_DAYS } from './day-plan.service.js';
import {
  allergenIntroductionsBefore,
  dishMap,
  loadPlanningContext,
  toUse,
} from './planning-context.js';

/**
 * BR-31: after a profile change, upcoming meals follow the new profile. Meals already past,
 * prepared or logged stay; a swapped meal stays while it is still safe at the same stage.
 */
@Injectable()
export class RegenerateFutureService {
  constructor(
    @Inject(MEAL_PLAN_REPOSITORY) private readonly plans: MealPlanRepository,
    @Inject(CHILD_PLANNING_READER) private readonly children: ChildPlanningReader,
    @Inject(PLANNING_CATALOG) private readonly catalog: PlanningCatalog,
    @Inject(FOOD_HISTORY_READER) private readonly history: FoodHistoryReader,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: { childId: string; userId: string }): Promise<void> {
    const child = await this.children.find(input.childId, input.userId);
    if (!child) return;

    const now = this.clock.now();
    const today = toLocalDate(now, APP_TIMEZONE);
    const nowTime = toLocalTime(now, APP_TIMEZONE);
    const upcoming = await this.plans.findBetween(
      child.childId,
      today,
      addDays(today, PLAN_AHEAD_DAYS),
    );
    const changeable = upcoming.filter(
      (m) => m.status === 'planned' && (m.date > today || m.time > nowTime),
    );

    if (child.stage === null) {
      await this.plans.remove(changeable.map((m) => m.id));
      return;
    }
    const stage = child.stage;
    const { ctx, schedule } = await loadPlanningContext(
      this.catalog,
      this.history,
      child,
      stage,
      today,
    );
    const byId = dishMap(ctx.dishes);
    const replaced = changeable.filter(
      (m) =>
        m.source === 'auto' ||
        m.stageId !== stage ||
        exclusionReason(byId.get(m.dishId)!, ctx, m.date) !== null,
    );
    await this.plans.remove(replaced.map((m) => m.id));

    const dates = [...new Set(replaced.map((m) => m.date))].sort();
    for (const date of dates) {
      const around = await this.plans.findBetween(
        child.childId,
        addDays(date, -7),
        addDays(date, 7),
      );
      const kept = new Set(around.filter((m) => m.date === date).map((m) => m.slot));
      const slots = slotsForDay(schedule, ctx.health).filter(
        (s) => !kept.has(s.slot) && (date > today || s.time > nowTime),
      );
      const generation = generateDay(ctx, {
        date,
        slots,
        history: around.map(toUse),
        allergenIntroductions: await allergenIntroductionsBefore(this.history, ctx, date, around),
      });
      await this.plans.addMany(
        generation.meals.map((draft) =>
          PlannedMeal.plan({
            id: this.ids.next(),
            childId: child.childId,
            date,
            stageId: stage,
            generatedAt: now,
            draft,
          }),
        ),
      );
    }
  }
}
