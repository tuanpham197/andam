import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import { ID_GENERATOR, type IdGenerator } from '../../../../shared/kernel/id-generator.port.js';
import { APP_TIMEZONE, addDays, toLocalDate } from '../../../../shared/kernel/local-date.js';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/kernel/unit-of-work.port.js';
import {
  CUSTOM_DISH_LIMIT,
  CUSTOM_DISH_PREFIX,
  buildCustomDish,
  unsafeIngredients,
  type CustomDish,
  type CustomDishDraft,
  type CustomDishInput,
} from '../../domain/custom-dish.js';
import {
  CustomDishLimitError,
  CustomDishNotSafeError,
  DishNameTakenError,
  DishNotFoundError,
  PlanChildNotFoundError,
} from '../../domain/errors.js';
import type { FoodGroup } from '../../domain/model.js';
import { newIngredientIds } from '../../domain/novelty.js';
import {
  CHILD_PLANNING_READER,
  type ChildPlanningInfo,
  type ChildPlanningReader,
} from '../ports/out/child-planning.reader.js';
import {
  CUSTOM_DISH_REPOSITORY,
  type CustomDishRepository,
} from '../ports/out/custom-dish.repository.js';
import { FOOD_HISTORY_READER, type FoodHistoryReader } from '../ports/out/food-history.reader.js';
import {
  MEAL_PLAN_REPOSITORY,
  type MealPlanRepository,
} from '../ports/out/meal-plan.repository.js';
import { PLAN_AHEAD_DAYS } from './day-plan.service.js';
import { loadPlanningContext } from './planning-context.js';
import { PlanningDishes } from './planning-dishes.js';
import { RecipeService, type RecipeView } from './recipe.service.js';
import { RegenerateFutureService } from './regenerate-future.service.js';

export interface CustomDishForm {
  id: string;
  name: string;
  mealType: CustomDish['mealType'];
  ingredients: {
    id: string;
    name: string;
    foodGroup: FoodGroup;
    qty: number | null;
    unit: string | null;
  }[];
  prepMin: number;
  cookMin: number;
  steps: string[];
}

/** UC-23: parents' own dishes ("Món của bạn"), checked against the hard filter (BR-80..87). */
@Injectable()
export class CustomDishService {
  constructor(
    @Inject(CUSTOM_DISH_REPOSITORY) private readonly customs: CustomDishRepository,
    @Inject(CHILD_PLANNING_READER) private readonly children: ChildPlanningReader,
    @Inject(PlanningDishes) private readonly catalog: PlanningDishes,
    @Inject(FOOD_HISTORY_READER) private readonly history: FoodHistoryReader,
    @Inject(MEAL_PLAN_REPOSITORY) private readonly plans: MealPlanRepository,
    @Inject(RecipeService) private readonly recipes: RecipeService,
    @Inject(RegenerateFutureService) private readonly regenerate: RegenerateFutureService,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  private async child(userId: string, childId: string): Promise<ChildPlanningInfo> {
    const child = await this.children.find(childId, userId);
    if (!child) throw new PlanChildNotFoundError();
    return child;
  }

  private async active(childId: string): Promise<CustomDish[]> {
    return (await this.customs.listForChild(childId)).filter((d) => d.archivedAt === null);
  }

  private async existing(childId: string, dishId: string): Promise<CustomDish> {
    const dish = (await this.active(childId)).find((d) => d.id === dishId);
    if (!dish) throw new DishNotFoundError();
    return dish;
  }

  /** Validates the input, the name (BR-87) and the hard filter for this child now (BR-82). */
  private async draft(
    child: ChildPlanningInfo,
    input: CustomDishInput,
    others: CustomDish[],
  ): Promise<CustomDishDraft> {
    const ingredients = new Map((await this.catalog.ingredients()).map((i) => [i.id, i]));
    const draft = buildCustomDish(input, ingredients);
    if (others.some((d) => d.nameKey === draft.nameKey)) throw new DishNameTakenError();
    const unsafe = unsafeIngredients(
      draft.lines.map((l) => l.ingredientId),
      {
        ingredients,
        ageMonths: child.ageMonths,
        avoidAllergens: new Set(child.avoidAllergens),
        avoidIngredients: new Set(child.avoidIngredients),
        paused: await this.history.paused(child.childId),
      },
    );
    if (unsafe.length > 0) {
      throw new CustomDishNotSafeError(
        unsafe.map((u) => ({ ...u, name: ingredients.get(u.id)!.name })),
      );
    }
    return draft;
  }

  async create(userId: string, childId: string, input: CustomDishInput): Promise<RecipeView> {
    const child = await this.child(userId, childId);
    const active = await this.active(childId);
    if (active.length >= CUSTOM_DISH_LIMIT) throw new CustomDishLimitError();
    const draft = await this.draft(child, input, active);
    const dish: CustomDish = {
      ...draft,
      id: `${CUSTOM_DISH_PREFIX}${this.ids.next()}`,
      childId,
      archivedAt: null,
    };
    await this.customs.create(dish, userId);
    return this.recipes.get(userId, childId, dish.id);
  }

  async form(userId: string, childId: string, dishId: string): Promise<CustomDishForm> {
    await this.child(userId, childId);
    const dish = await this.existing(childId, dishId);
    const foods = new Map((await this.catalog.ingredients()).map((i) => [i.id, i]));
    return {
      id: dish.id,
      name: dish.name,
      mealType: dish.mealType,
      ingredients: dish.lines.map((l) => ({
        id: l.ingredientId,
        name: foods.get(l.ingredientId)!.name,
        foodGroup: foods.get(l.ingredientId)!.foodGroup,
        qty: l.qty,
        unit: l.unit,
      })),
      prepMin: dish.prepMin,
      cookMin: dish.cookMin,
      steps: dish.steps,
    };
  }

  /** BR-86: upcoming meals with this dish get their first tries worked out again. */
  async update(
    userId: string,
    childId: string,
    dishId: string,
    input: CustomDishInput,
  ): Promise<RecipeView> {
    const child = await this.child(userId, childId);
    const current = await this.existing(childId, dishId);
    const others = (await this.active(childId)).filter((d) => d.id !== dishId);
    const draft = await this.draft(child, input, others);
    await this.uow.run(async () => {
      await this.customs.update({ ...current, ...draft });
      await this.refreshUpcoming(child, dishId);
    });
    return this.recipes.get(userId, childId, dishId);
  }

  private async refreshUpcoming(child: ChildPlanningInfo, dishId: string): Promise<void> {
    if (child.stage === null) return;
    const today = toLocalDate(this.clock.now(), APP_TIMEZONE);
    const upcoming = (
      await this.plans.findBetween(child.childId, today, addDays(today, PLAN_AHEAD_DAYS))
    ).filter((m) => m.isPending && m.dishId === dishId);
    if (upcoming.length === 0) return;
    const { ctx } = await loadPlanningContext(
      this.catalog,
      this.history,
      child,
      child.stage,
      today,
    );
    const dish = ctx.dishes.find((d) => d.id === dishId)!;
    for (const meal of upcoming) {
      meal.updateNewIngredients(newIngredientIds(dish, ctx));
      await this.plans.save(meal);
    }
  }

  /** BR-86: kept for past meals and the journal; upcoming meals with it are planned again. */
  async archive(userId: string, childId: string, dishId: string): Promise<void> {
    await this.child(userId, childId);
    await this.existing(childId, dishId);
    await this.uow.run(async () => {
      await this.customs.archive(dishId, this.clock.now());
      await this.regenerate.execute({ childId, userId, scope: 'unsafe' });
    });
  }
}
