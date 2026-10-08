import { Inject, Injectable } from '@nestjs/common';
import { MealAccessService } from '../../../../meal-planning/application/use-cases/meal-access.service.js';
import type { LoggableMeals } from '../../../application/ports/out/loggable-meals.port.js';
import type { LoggableMeal, MealOutcome } from '../../../domain/model.js';

/** Anti-corruption layer over the planning module's meals. */
@Injectable()
export class LoggableMealsAdapter implements LoggableMeals {
  constructor(@Inject(MealAccessService) private readonly meals: MealAccessService) {}

  async find(userId: string, mealId: string): Promise<LoggableMeal | null> {
    const meal = await this.meals.find(userId, mealId);
    if (!meal) return null;
    return {
      id: meal.id,
      childId: meal.childId,
      date: meal.date,
      slot: meal.slot,
      time: meal.time,
      status: meal.status,
      dish: meal.dish,
      ingredients: meal.ingredients.map(({ id, name, allergenTags }) => ({
        id,
        name,
        allergenTags,
      })),
      firstTryIds: meal.firstTryIds,
    };
  }

  markLogged(userId: string, mealId: string, outcome: MealOutcome): Promise<void> {
    return this.meals.markLogged(userId, mealId, outcome);
  }
}
