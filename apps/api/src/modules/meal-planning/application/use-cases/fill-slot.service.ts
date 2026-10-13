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
  ChildNotPlannableError,
  DateOutOfRangeError,
  DishNotForSlotError,
  DishNotFoundError,
  DishNotSafeError,
  InvalidDateError,
  NoSafeDishError,
  PlanChildNotFoundError,
  SlotNotInPlanError,
  SlotTakenError,
} from '../../domain/errors.js';
import { servingFor } from '../../domain/health-adjustment.js';
import { generateDay, mealTypeOf, type PlannedDraft } from '../../domain/menu-engine.js';
import { offered, type MealSlot } from '../../domain/model.js';
import { newAllergenIds, newIngredientIds } from '../../domain/novelty.js';
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
import { DayPlanService, PLAN_AHEAD_DAYS } from './day-plan.service.js';
import { PlanningDishes } from './planning-dishes.js';
import {
  allergenIntroductionsBefore,
  dishMap,
  loadPlanningContext,
  toMealView,
  toUse,
  type MealView,
} from './planning-context.js';

/** UC-24: a slot the plan could not fill, filled on the parent's request (BR-90..92). */
@Injectable()
export class FillSlotService {
  constructor(
    @Inject(MEAL_PLAN_REPOSITORY) private readonly plans: MealPlanRepository,
    @Inject(CHILD_PLANNING_READER) private readonly children: ChildPlanningReader,
    @Inject(PlanningDishes) private readonly catalog: PlanningDishes,
    @Inject(FOOD_HISTORY_READER) private readonly history: FoodHistoryReader,
    @Inject(DayPlanService) private readonly dayPlans: DayPlanService,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async fill(
    userId: string,
    childId: string,
    date: LocalDate,
    slot: MealSlot,
    dishId?: string,
  ): Promise<MealView> {
    if (!isValidLocalDate(date)) throw new InvalidDateError();
    const child = await this.children.find(childId, userId);
    if (!child) throw new PlanChildNotFoundError();
    if (child.stage === null) throw new ChildNotPlannableError();
    const now = this.clock.now();
    const today = toLocalDate(now, APP_TIMEZONE);
    if (date < today || date > addDays(today, PLAN_AHEAD_DAYS)) throw new DateOutOfRangeError();

    // The day is planned first, so the slot is only "empty" when the engine found nothing.
    const scheduled = (await this.dayPlans.ensurePlanned(child, [date])).get(date)!;
    const slotTime = scheduled.find((s) => s.slot === slot);
    if (!slotTime) throw new SlotNotInPlanError();
    const around = await this.plans.findBetween(childId, addDays(date, -7), addDays(date, 7));
    if (around.some((m) => m.date === date && m.slot === slot)) throw new SlotTakenError();

    const { ctx: base } = await loadPlanningContext(
      this.catalog,
      this.history,
      child,
      child.stage,
      today,
    );
    const ctx = { ...base, health: await this.history.health(childId, date) };

    let draft: PlannedDraft;
    if (dishId === undefined) {
      const generation = generateDay(ctx, {
        date,
        slots: [slotTime],
        history: around.map(toUse),
        allergenIntroductions: await allergenIntroductionsBefore(this.history, ctx, date, around),
        allowRepeats: true,
      });
      if (generation.meals.length === 0) throw new NoSafeDishError();
      draft = generation.meals[0]!;
    } else {
      // BR-91: the parent's own pick is checked like a swap (hard filter + kind of slot).
      const dish = offered(ctx.dishes).find((d) => d.id === dishId);
      if (!dish) throw new DishNotFoundError();
      if (dish.mealType !== mealTypeOf(slot)) throw new DishNotForSlotError();
      const unsafe = exclusionReason(dish, ctx, date);
      if (unsafe) throw new DishNotSafeError(unsafe);
      draft = {
        ...slotTime,
        dishId: dish.id,
        ...servingFor(dish, ctx),
        newIngredientIds: newIngredientIds(dish, ctx),
        newAllergenIds: newAllergenIds(dish, ctx),
        reasons: [],
      };
    }

    const meal = PlannedMeal.fill({
      id: this.ids.next(),
      childId,
      date,
      stageId: child.stage,
      generatedAt: now,
      draft,
    });
    // Another member may have filled it a moment ago.
    if (!(await this.plans.addMany([meal]))) throw new SlotTakenError();
    return toMealView(meal, dishMap(ctx.dishes), ctx.ingredients);
  }
}
