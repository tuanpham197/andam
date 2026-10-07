import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import {
  APP_TIMEZONE,
  addDays,
  isValidLocalDate,
  toLocalDate,
  toLocalTime,
  weekStartOf,
  type LocalDate,
} from '../../../../shared/kernel/local-date.js';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/kernel/unit-of-work.port.js';
import {
  ChildNotPlannableError,
  InvalidWeekStartError,
  PlanChildNotFoundError,
  PlanExistsError,
  WeekOutOfRangeError,
} from '../../domain/errors.js';
import { dayGroupsCovered, weekStats, type WeekStats } from '../../domain/week.js';
import {
  CHILD_PLANNING_READER,
  type ChildPlanningInfo,
  type ChildPlanningReader,
} from '../ports/out/child-planning.reader.js';
import {
  MEAL_PLAN_REPOSITORY,
  type MealPlanRepository,
} from '../ports/out/meal-plan.repository.js';
import { PLANNING_CATALOG, type PlanningCatalog } from '../ports/out/planning-catalog.port.js';
import { DayPlanService } from './day-plan.service.js';
import { dishMap, toMealView, toUse, type MealView } from './planning-context.js';

export interface WeekPlanView {
  weekStart: LocalDate;
  plannable: boolean;
  days: { date: LocalDate; meals: MealView[]; groupsCovered: number }[];
  stats: WeekStats;
}

const WEEK_DAYS = 7;

/** UC-12/13: a Monday-to-Sunday week with its indicators, and planning the next one. */
@Injectable()
export class WeekPlanService {
  constructor(
    @Inject(MEAL_PLAN_REPOSITORY) private readonly plans: MealPlanRepository,
    @Inject(CHILD_PLANNING_READER) private readonly children: ChildPlanningReader,
    @Inject(PLANNING_CATALOG) private readonly catalog: PlanningCatalog,
    @Inject(DayPlanService) private readonly dayPlans: DayPlanService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  private async weekOf(userId: string, childId: string, weekStart: LocalDate) {
    if (!isValidLocalDate(weekStart) || weekStartOf(weekStart) !== weekStart)
      throw new InvalidWeekStartError();
    const child = await this.children.find(childId, userId);
    if (!child) throw new PlanChildNotFoundError();
    const dates = Array.from({ length: WEEK_DAYS }, (_, i) => addDays(weekStart, i));
    return { child, dates };
  }

  async getWeek(userId: string, childId: string, weekStart: LocalDate): Promise<WeekPlanView> {
    const { child, dates } = await this.weekOf(userId, childId, weekStart);
    // Upcoming days are planned on first read, like the day screen; past weeks never are.
    await this.dayPlans.ensurePlanned(child, dates);
    return this.view(child, weekStart, dates);
  }

  /**
   * UC-13 "Lên thực đơn tuần sau": plans this or next week. An existing plan is only replaced
   * when the parent confirmed (`overwrite`), and then only meals not cooked or logged yet.
   */
  async generate(
    userId: string,
    childId: string,
    weekStart: LocalDate,
    overwrite: boolean,
  ): Promise<WeekPlanView> {
    const { child, dates } = await this.weekOf(userId, childId, weekStart);
    if (child.stage === null) throw new ChildNotPlannableError();
    const now = this.clock.now();
    const today = toLocalDate(now, APP_TIMEZONE);
    const nowTime = toLocalTime(now, APP_TIMEZONE);
    if (weekStart > addDays(weekStartOf(today), WEEK_DAYS) || dates[WEEK_DAYS - 1]! < today)
      throw new WeekOutOfRangeError();

    await this.uow.run(async () => {
      const upcoming = (await this.plans.findBetween(childId, today, dates[WEEK_DAYS - 1]!)).filter(
        (m) => m.date >= weekStart,
      );
      if (upcoming.length > 0 && !overwrite) throw new PlanExistsError();
      await this.plans.remove(
        upcoming
          .filter((m) => m.status === 'planned' && (m.date > today || m.time > nowTime))
          .map((m) => m.id),
      );
      await this.dayPlans.ensurePlanned(child, dates, true);
    });
    return this.view(child, weekStart, dates);
  }

  private async view(
    child: ChildPlanningInfo,
    weekStart: LocalDate,
    dates: LocalDate[],
  ): Promise<WeekPlanView> {
    const [meals, dishes, ingredients] = await Promise.all([
      this.plans.findBetween(child.childId, dates[0]!, dates[WEEK_DAYS - 1]!),
      this.catalog.dishes(),
      this.catalog.ingredients(),
    ]);
    const byId = dishMap(dishes);
    const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
    const stats = {
      dishes,
      ingredients: ingredientById,
      avoidAllergens: new Set(child.avoidAllergens),
      avoidIngredients: new Set(child.avoidIngredients),
    };
    return {
      weekStart,
      plannable: child.stage !== null,
      days: dates.map((date) => {
        const ofDay = meals.filter((m) => m.date === date);
        return {
          date,
          meals: ofDay.map((m) => toMealView(m, byId, ingredientById)),
          groupsCovered: dayGroupsCovered(
            stats,
            ofDay.map((m) => m.dishId),
          ),
        };
      }),
      stats: weekStats(stats, meals.map(toUse)),
    };
  }
}
