import { Inject, Injectable } from '@nestjs/common';
import {
  CATALOG_READER,
  type CatalogReader,
} from '../../../../catalog/application/ports/out/catalog.reader.js';
import { ChildAccessService } from '../../../../child-profile/application/use-cases/child-access.service.js';
import { MealAccessService } from '../../../../meal-planning/application/use-cases/meal-access.service.js';
import type { SafetyContext } from '../../../application/ports/out/safety-context.port.js';
import type { SafetyMeal } from '../../../domain/model.js';

/** Anti-corruption layer over child-profile (membership), meal-planning (meals) and catalog (names). */
@Injectable()
export class SafetyContextAdapter implements SafetyContext {
  constructor(
    @Inject(ChildAccessService) private readonly access: ChildAccessService,
    @Inject(MealAccessService) private readonly meals: MealAccessService,
    @Inject(CATALOG_READER) private readonly catalog: CatalogReader,
  ) {}

  roleOf(userId: string, childId: string): Promise<'owner' | 'caregiver' | null> {
    return this.access.roleOf(userId, childId);
  }

  async meal(userId: string, mealId: string): Promise<SafetyMeal | null> {
    const meal = await this.meals.find(userId, mealId);
    if (!meal) return null;
    return {
      id: meal.id,
      childId: meal.childId,
      ingredients: meal.ingredients.map(({ id, allergenTags }) => ({ id, allergenTags })),
      firstTryIds: meal.firstTryIds,
    };
  }

  async ingredientNames(ids: string[]): Promise<Map<string, string>> {
    return new Map((await this.catalog.findIngredientsByIds(ids)).map((i) => [i.id, i.name]));
  }
}
