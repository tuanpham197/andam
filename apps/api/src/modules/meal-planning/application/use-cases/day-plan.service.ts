import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import { ID_GENERATOR, type IdGenerator } from '../../../../shared/kernel/id-generator.port.js';
import {
  APP_TIMEZONE,
  addDays,
  isValidLocalDate,
  toLocalDate,
  toLocalTime,
  type LocalDate,
} from '../../../../shared/kernel/local-date.js';
import {
  InvalidDateError,
  MealNotFoundError,
  PlanChildNotFoundError,
} from '../../domain/errors.js';
import { HEALTH_ADJUSTMENTS, type HealthAdjustment } from '../../domain/health-adjustment.js';
import { generateDay, slotsForDay } from '../../domain/menu-engine.js';
import type { HealthState, ScheduledSlot } from '../../domain/model.js';
import { nextMealId } from '../../domain/next-meal.js';
import { PlannedMeal, type MealStatus } from '../../domain/planned-meal.js';
import {
  CHILD_PLANNING_READER,
  type ChildPlanningInfo,
  type ChildPlanningReader,
} from '../ports/out/child-planning.reader.js';
import { FOOD_HISTORY_READER, type FoodHistoryReader } from '../ports/out/food-history.reader.js';
import {
  MEAL_PLAN_REPOSITORY,
  type MealPlanRepository,
} from '../ports/out/meal-plan.repository.js';
import { PlanningDishes } from './planning-dishes.js';
import {
  allergenIntroductionsBefore,
  dishMap,
  loadPlanningContext,
  toMealView,
  toUse,
  type MealView,
} from './planning-context.js';

/** Days ahead the plan is generated on demand: this week and the next. */
export const PLAN_AHEAD_DAYS = 13;

export interface DayPlanView {
  date: LocalDate;
  plannable: boolean;
  meals: MealView[];
  unfilledSlots: ScheduledSlot[];
  nextMealId: string | null;
}

@Injectable()
export class DayPlanService {
  constructor(
    @Inject(MEAL_PLAN_REPOSITORY) private readonly plans: MealPlanRepository,
    @Inject(CHILD_PLANNING_READER) private readonly children: ChildPlanningReader,
    @Inject(PlanningDishes) private readonly catalog: PlanningDishes,
    @Inject(FOOD_HISTORY_READER) private readonly history: FoodHistoryReader,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async getDay(userId: string, childId: string, date: LocalDate): Promise<DayPlanView> {
    if (!isValidLocalDate(date)) throw new InvalidDateError();
    const child = await this.children.find(childId, userId);
    if (!child) throw new PlanChildNotFoundError();

    const slots = (await this.ensurePlanned(child, [date])).get(date) ?? [];
    const meals = await this.plans.findBetween(childId, date, date);
    const [dishes, ingredients, logged] = await Promise.all([
      this.catalog.forChild(childId),
      this.catalog.ingredients(),
      this.history.loggedBy(meals.filter((m) => !m.isPending).map((m) => m.id)),
    ]);
    const byId = dishMap(dishes);
    const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
    const occupied = new Set(meals.map((m) => m.slot));

    return {
      date,
      plannable: child.stage !== null,
      meals: meals.map((m) => toMealView(m, byId, ingredientById, logged.get(m.id) ?? null)),
      unfilledSlots: slots.filter((s) => !occupied.has(s.slot)),
      nextMealId: nextMealId(meals),
    };
  }

  /**
   * Plans, on first read, the given days that fall in the planning window (today → +13 days).
   * With `fillSlots`, days that already have meals get their missing upcoming slots too.
   * Returns each planned day's slots (with the day's health, BR-50).
   */
  async ensurePlanned(
    child: ChildPlanningInfo,
    dates: LocalDate[],
    fillSlots = false,
  ): Promise<Map<LocalDate, ScheduledSlot[]>> {
    const now = this.clock.now();
    const today = toLocalDate(now, APP_TIMEZONE);
    const nowTime = toLocalTime(now, APP_TIMEZONE);
    const slotsByDate = new Map<LocalDate, ScheduledSlot[]>();
    const inWindow = dates.filter((d) => d >= today && d <= addDays(today, PLAN_AHEAD_DAYS));
    if (child.stage === null || inWindow.length === 0) return slotsByDate;
    const stage = child.stage;

    const { ctx: base, schedule } = await loadPlanningContext(
      this.catalog,
      this.history,
      child,
      stage,
      today,
    );
    for (const date of inWindow) {
      const ctx = { ...base, health: await this.history.health(child.childId, date) };
      const slots = slotsForDay(schedule, ctx.health);
      slotsByDate.set(date, slots);
      const around = await this.plans.findBetween(
        child.childId,
        addDays(date, -7),
        addDays(date, 7),
      );
      const taken = new Set(around.filter((m) => m.date === date).map((m) => m.slot));
      if (taken.size > 0 && !fillSlots) continue;
      const open = slots.filter(
        (s) => !taken.has(s.slot) && (taken.size === 0 || date > today || s.time > nowTime),
      );
      if (open.length === 0) continue;
      const generation = generateDay(ctx, {
        date,
        slots: open,
        history: around.map(toUse),
        allergenIntroductions: await allergenIntroductionsBefore(this.history, ctx, date, around),
      });
      // A concurrent first read may have stored its plan first; callers read back.
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
    return slotsByDate;
  }

  /** FR-083: what the menu will do for a health status, before the parent applies it. */
  async healthPreview(
    userId: string,
    childId: string,
    status: HealthState,
  ): Promise<HealthAdjustment & { status: HealthState }> {
    if (!(await this.children.find(childId, userId))) throw new PlanChildNotFoundError();
    return { status, ...HEALTH_ADJUSTMENTS[status] };
  }

  async markPrepared(userId: string, mealId: string): Promise<{ id: string; status: MealStatus }> {
    const meal = await this.plans.findOwned(mealId, userId);
    if (!meal) throw new MealNotFoundError();
    meal.markPrepared();
    await this.plans.save(meal);
    return { id: meal.id, status: meal.status };
  }
}
