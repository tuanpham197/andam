import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import { ID_GENERATOR, type IdGenerator } from '../../../../shared/kernel/id-generator.port.js';
import {
  APP_TIMEZONE,
  addDays,
  toLocalDate,
  toLocalTime,
  type LocalDate,
} from '../../../../shared/kernel/local-date.js';
import { servingFor } from '../../domain/health-adjustment.js';
import { generateDay, slotsForDay } from '../../domain/menu-engine.js';
import type { PlanningContext } from '../../domain/model.js';
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
import { PlanningDishes } from './planning-dishes.js';
import { PLAN_AHEAD_DAYS } from './day-plan.service.js';
import {
  allergenIntroductionsBefore,
  dishMap,
  loadPlanningContext,
  toUse,
} from './planning-context.js';

/**
 * - `all`: after a profile, health or resumed-food change, automatic meals are planned again.
 * - `unsafe`: after a food is paused or a dish deleted, only meals that became unsafe change.
 */
export type RegenerateScope = 'all' | 'unsafe';

/**
 * BR-31: upcoming meals follow the child's current profile and health. Past and logged meals
 * never change. A swapped or prepared meal stays while it is still safe at the same stage; once
 * unsafe it is replaced, prepared or not — a dish the child must not eat is never left on the plan.
 */
@Injectable()
export class RegenerateFutureService {
  constructor(
    @Inject(MEAL_PLAN_REPOSITORY) private readonly plans: MealPlanRepository,
    @Inject(CHILD_PLANNING_READER) private readonly children: ChildPlanningReader,
    @Inject(PlanningDishes) private readonly catalog: PlanningDishes,
    @Inject(FOOD_HISTORY_READER) private readonly history: FoodHistoryReader,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: {
    childId: string;
    userId: string;
    scope?: RegenerateScope;
    /** A meal being eaten right now (the one the child reacted to) stays as it is. */
    keepMealId?: string | null;
  }): Promise<void> {
    const scope = input.scope ?? 'all';
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
    const future = upcoming.filter(
      (m) => m.isPending && m.id !== input.keepMealId && (m.date > today || m.time > nowTime),
    );

    if (child.stage === null) {
      await this.plans.remove(future.filter((m) => m.status === 'planned').map((m) => m.id));
      return;
    }
    const stage = child.stage;
    const { ctx: base, schedule } = await loadPlanningContext(
      this.catalog,
      this.history,
      child,
      stage,
      today,
    );
    // Health follows the episode's dates, so each day is planned with its own status (FR-082).
    const dates = [...new Set(future.map((m) => m.date))].sort();
    const contexts = new Map<LocalDate, PlanningContext>();
    for (const date of dates)
      contexts.set(date, { ...base, health: await this.history.health(child.childId, date) });

    const byId = dishMap(base.dishes);
    const unsafe = (m: PlannedMeal) => {
      const dish = byId.get(m.dishId)!;
      return (
        m.stageId !== stage ||
        dish.archived === true ||
        exclusionReason(dish, contexts.get(m.date)!, m.date) !== null
      );
    };
    const replaced = future.filter(
      (m) => unsafe(m) || (scope === 'all' && m.status === 'planned' && m.source === 'auto'),
    );
    await this.plans.remove(replaced.map((m) => m.id));

    // A dish the parent chose stays, served for the day's health (texture, portion); a meal
    // already prepared is served as it was cooked.
    const removed = new Set(replaced.map((m) => m.id));
    for (const meal of future.filter((m) => m.status === 'planned' && !removed.has(m.id))) {
      const serving = servingFor(byId.get(meal.dishId)!, contexts.get(meal.date)!);
      if (serving.texture === meal.texture && serving.portionText === meal.portionText) continue;
      meal.reserve(serving);
      await this.plans.save(meal);
    }

    for (const date of dates) {
      const ctx = contexts.get(date)!;
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
