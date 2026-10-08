import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import { ID_GENERATOR, type IdGenerator } from '../../../../shared/kernel/id-generator.port.js';
import {
  APP_TIMEZONE,
  addDays,
  isValidLocalDate,
  toLocalDate,
  type LocalDate,
} from '../../../../shared/kernel/local-date.js';
import {
  InvalidDateError,
  MealNotFoundError,
  PlanChildNotFoundError,
} from '../../domain/errors.js';
import { generateDay, slotsForDay } from '../../domain/menu-engine.js';
import type { ScheduledSlot } from '../../domain/model.js';
import { nextMealId } from '../../domain/next-meal.js';
import { PlannedMeal, type MealStatus } from '../../domain/planned-meal.js';
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

    const now = this.clock.now();
    const today = toLocalDate(now, APP_TIMEZONE);
    let meals = await this.plans.findBetween(childId, date, date);
    let slots: ScheduledSlot[] = [];

    if (child.stage !== null && date >= today && date <= addDays(today, PLAN_AHEAD_DAYS)) {
      const { ctx, schedule } = await loadPlanningContext(
        this.catalog,
        this.history,
        child,
        child.stage,
        date,
      );
      slots = slotsForDay(schedule, ctx.health);
      if (meals.length === 0) {
        const around = await this.plans.findBetween(childId, addDays(date, -7), addDays(date, 7));
        const generation = generateDay(ctx, {
          date,
          slots,
          history: around.map(toUse),
          allergenIntroductions: await allergenIntroductionsBefore(this.history, ctx, date, around),
        });
        const created = generation.meals.map((draft) =>
          PlannedMeal.plan({
            id: this.ids.next(),
            childId,
            date,
            stageId: child.stage!,
            generatedAt: now,
            draft,
          }),
        );
        // A concurrent first read may have stored its plan first; either way, read back.
        await this.plans.addMany(created);
        meals = await this.plans.findBetween(childId, date, date);
      }
    }

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

  async markPrepared(userId: string, mealId: string): Promise<{ id: string; status: MealStatus }> {
    const meal = await this.plans.findOwned(mealId, userId);
    if (!meal) throw new MealNotFoundError();
    meal.markPrepared();
    await this.plans.save(meal);
    return { id: meal.id, status: meal.status };
  }
}
