import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import { ID_GENERATOR, type IdGenerator } from '../../../../shared/kernel/id-generator.port.js';
import { APP_TIMEZONE, addDays, toLocalDate } from '../../../../shared/kernel/local-date.js';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/kernel/unit-of-work.port.js';
import {
  ChildNotPlannableError,
  DishNotForSlotError,
  DishNotFoundError,
  DishNotSafeError,
  MealAlreadyLoggedError,
  MealInPastError,
  MealNotFoundError,
  MealChangedError,
} from '../../domain/errors.js';
import { variantFor } from '../../domain/menu-engine.js';
import type { MealSlot, ProteinSource, Texture } from '../../domain/model.js';
import { newIngredientIds } from '../../domain/novelty.js';
import type { PlannedMeal } from '../../domain/planned-meal.js';
import { exclusionReason, type ExclusionSummary } from '../../domain/safety-filter.js';
import { suggestSwaps, type SwapReason, type SwapReasonCode } from '../../domain/swap.js';
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
  dishSummary,
  loadPlanningContext,
  namedIngredients,
  toMealView,
  toUse,
  type MealView,
} from './planning-context.js';

export interface SwapSuggestionsView {
  meal: { id: string; slot: MealSlot; time: string; dish: { id: string; name: string } };
  reason: SwapReason;
  ranked: {
    dish: ReturnType<typeof dishSummary>;
    texture: Texture;
    portionText: string;
    newIngredients: { id: string; name: string }[];
    reasons: SwapReasonCode[];
    fasterByMin: number;
    repeatInDays: number | null;
  }[];
  /** The day's other main meals, so "khác nguồn đạm bữa tối (gà)" can be said (design S02). */
  otherMains: { slot: MealSlot; protein: ProteinSource }[];
  excluded: ExclusionSummary;
  relaxedWindowDays: 3 | null;
}

/** UC-06: suggestions for a meal, and the swap itself with the hard filter checked again. */
@Injectable()
export class SwapService {
  constructor(
    @Inject(MEAL_PLAN_REPOSITORY) private readonly plans: MealPlanRepository,
    @Inject(CHILD_PLANNING_READER) private readonly children: ChildPlanningReader,
    @Inject(PlanningDishes) private readonly catalog: PlanningDishes,
    @Inject(FOOD_HISTORY_READER) private readonly history: FoodHistoryReader,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  /** The meal, if it can still be swapped, with the child's planning context on its day. */
  private async swappable(userId: string, mealId: string) {
    const meal = await this.plans.findOwned(mealId, userId);
    if (!meal) throw new MealNotFoundError();
    if (meal.status === 'eaten' || meal.status === 'refused') throw new MealAlreadyLoggedError();
    if (meal.date < toLocalDate(this.clock.now(), APP_TIMEZONE)) throw new MealInPastError();
    // findOwned already proved the child belongs to the user.
    const child = (await this.children.find(meal.childId, userId))!;
    if (child.stage === null) throw new ChildNotPlannableError();
    const { ctx } = await loadPlanningContext(
      this.catalog,
      this.history,
      child,
      child.stage,
      meal.date,
    );
    return { meal, ctx };
  }

  private async around(meal: PlannedMeal) {
    const meals = await this.plans.findBetween(
      meal.childId,
      addDays(meal.date, -7),
      addDays(meal.date, 7),
    );
    return meals.filter((m) => m.id !== meal.id);
  }

  async suggestions(
    userId: string,
    mealId: string,
    reason: SwapReason,
  ): Promise<SwapSuggestionsView> {
    const { meal, ctx } = await this.swappable(userId, mealId);
    const around = await this.around(meal);
    const result = suggestSwaps(ctx, {
      date: meal.date,
      slot: meal.slot,
      currentDishId: meal.dishId,
      reason,
      history: around.map(toUse),
      allergenIntroductions: await allergenIntroductionsBefore(
        this.history,
        ctx,
        meal.date,
        around,
      ),
    });
    const byId = dishMap(ctx.dishes);
    const otherMains = around
      .filter((m) => m.date === meal.date)
      .map((m) => ({ slot: m.slot, dish: byId.get(m.dishId)! }))
      .filter(({ dish }) => dish.mealType === 'main' && dish.mainProtein !== null)
      .map(({ slot, dish }) => ({ slot, protein: dish.mainProtein! }));

    return {
      meal: {
        id: meal.id,
        slot: meal.slot,
        time: meal.time,
        dish: { id: meal.dishId, name: byId.get(meal.dishId)!.name },
      },
      reason,
      ranked: result.ranked.map(({ dishId, newIngredientIds: firstTries, ...rest }) => ({
        ...rest,
        dish: dishSummary(byId.get(dishId)!, ctx.ingredients),
        newIngredients: namedIngredients(firstTries, ctx.ingredients),
      })),
      otherMains,
      excluded: result.excluded,
      relaxedWindowDays: result.relaxedWindowDays,
    };
  }

  async apply(
    userId: string,
    mealId: string,
    input: { dishId: string; reason: SwapReason; expectedDishId?: string },
  ): Promise<MealView> {
    const { meal, ctx } = await this.swappable(userId, mealId);
    // BR-77: the parent chose looking at another dish than the one the meal has now.
    if (input.expectedDishId !== undefined && input.expectedDishId !== meal.dishId) {
      throw new MealChangedError();
    }
    const byId = dishMap(ctx.dishes);
    const dish = byId.get(input.dishId);
    if (!dish) throw new DishNotFoundError();
    if (dish.mealType !== byId.get(meal.dishId)!.mealType) throw new DishNotForSlotError();
    const unsafe = exclusionReason(dish, ctx, meal.date);
    if (unsafe) throw new DishNotSafeError(unsafe);

    const fromDishId = meal.dishId;
    const variant = variantFor(dish, ctx.stage);
    meal.swapTo({
      dishId: dish.id,
      texture: variant.texture,
      portionText: variant.portionText,
      newIngredientIds: newIngredientIds(dish, ctx),
    });
    await this.uow.run(async () => {
      // A concurrent swap or log by another member wins; this one is refused, not overwritten.
      if (!(await this.plans.saveSwap(meal, fromDishId))) throw new MealChangedError();
      await this.plans.recordSwap({
        id: this.ids.next(),
        mealId: meal.id,
        fromDishId,
        toDishId: dish.id,
        reason: input.reason,
        createdAt: this.clock.now(),
        actorId: userId,
      });
    });
    return toMealView(meal, byId, ctx.ingredients);
  }
}
