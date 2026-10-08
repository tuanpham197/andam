import { Inject, Injectable } from '@nestjs/common';
import { MealNotFoundError } from '../../domain/errors.js';
import type { Allergen, FoodGroup, MealSlot } from '../../domain/model.js';
import type { MealStatus } from '../../domain/planned-meal.js';
import { FOOD_HISTORY_READER, type FoodHistoryReader } from '../ports/out/food-history.reader.js';
import {
  MEAL_PLAN_REPOSITORY,
  type MealPlanRepository,
} from '../ports/out/meal-plan.repository.js';
import { PlanningDishes } from './planning-dishes.js';

/** A planned meal with its foods, for the modules that log meals and keep the child safe. */
export interface MealDetails {
  id: string;
  childId: string;
  date: string;
  slot: MealSlot;
  time: string;
  status: MealStatus;
  dish: { id: string; name: string; custom: boolean };
  ingredients: { id: string; name: string; foodGroup: FoodGroup; allergenTags: Allergen[] }[];
  /** Foods of the meal the child has still never eaten (BR-40, BR-41). */
  firstTryIds: string[];
}

/** What other modules may know and change about a planned meal, always for its owner. */
@Injectable()
export class MealAccessService {
  constructor(
    @Inject(MEAL_PLAN_REPOSITORY) private readonly plans: MealPlanRepository,
    @Inject(PlanningDishes) private readonly catalog: PlanningDishes,
    @Inject(FOOD_HISTORY_READER) private readonly history: FoodHistoryReader,
  ) {}

  async find(userId: string, mealId: string): Promise<MealDetails | null> {
    const meal = await this.plans.findOwned(mealId, userId);
    if (!meal) return null;
    const [dishes, ingredients, tried] = await Promise.all([
      this.catalog.forChild(meal.childId),
      this.catalog.ingredients(),
      this.history.tried(meal.childId),
    ]);
    const dish = dishes.find((d) => d.id === meal.dishId)!;
    const byId = new Map(ingredients.map((i) => [i.id, i]));
    return {
      id: meal.id,
      childId: meal.childId,
      date: meal.date,
      slot: meal.slot,
      time: meal.time,
      status: meal.status,
      dish: { id: dish.id, name: dish.name, custom: dish.custom === true },
      ingredients: dish.ingredientIds.map((id) => {
        const i = byId.get(id)!;
        return { id, name: i.name, foodGroup: i.foodGroup, allergenTags: i.allergenTags };
      }),
      firstTryIds: meal.newIngredientIds.filter((id) => !tried.has(id)),
    };
  }

  /** UC-08: closes the meal; throws when another parent logged it first (MEAL_ALREADY_LOGGED). */
  async markLogged(userId: string, mealId: string, outcome: 'eaten' | 'refused'): Promise<void> {
    const meal = await this.plans.findOwned(mealId, userId);
    if (!meal) throw new MealNotFoundError();
    meal.markLogged(outcome);
    await this.plans.save(meal);
  }
}
