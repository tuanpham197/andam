import { Inject, Injectable } from '@nestjs/common';
import { CUSTOM_DISH_PREFIX, customPlanDish } from '../../domain/custom-dish.js';
import type { PlanDish, PlanIngredient, StageId } from '../../domain/model.js';
import {
  CUSTOM_DISH_REPOSITORY,
  type CustomDishRepository,
} from '../ports/out/custom-dish.repository.js';
import {
  PLANNING_CATALOG,
  type PlanningCatalog,
  type Recipe,
} from '../ports/out/planning-catalog.port.js';

/** Shown on every "Món của bạn" recipe: nobody reviewed it, so the basics are spelled out (BR-85). */
export const CUSTOM_SAFETY_NOTES = [
  'Không thêm muối, nước mắm hay đường cho bé dưới 1 tuổi.',
  'Nấu chín kỹ, nghiền hoặc cắt nhỏ đúng kết cấu của giai đoạn để bé không bị hóc.',
];

/** The dishes one child can be offered: the catalog plus the child's own dishes (F18). */
@Injectable()
export class PlanningDishes {
  constructor(
    @Inject(PLANNING_CATALOG) private readonly catalog: PlanningCatalog,
    @Inject(CUSTOM_DISH_REPOSITORY) private readonly customs: CustomDishRepository,
  ) {}

  ingredients(): Promise<PlanIngredient[]> {
    return this.catalog.ingredients();
  }

  schedule(stage: StageId) {
    return this.catalog.schedule(stage);
  }

  /** Deleted dishes of the child are included, flagged `archived`, so past meals keep their name. */
  async forChild(childId: string): Promise<PlanDish[]> {
    const [catalog, own, stages] = await Promise.all([
      this.catalog.dishes(),
      this.customs.listForChild(childId),
      this.catalog.stageDefaults(),
    ]);
    return [...catalog, ...own.map((dish) => customPlanDish(dish, stages))];
  }

  async recipe(childId: string, dishId: string): Promise<Recipe | null> {
    if (!dishId.startsWith(CUSTOM_DISH_PREFIX)) return this.catalog.recipe(dishId);
    const [own, stages, ingredients] = await Promise.all([
      this.customs.listForChild(childId),
      this.catalog.stageDefaults(),
      this.catalog.ingredients(),
    ]);
    const dish = own.find((d) => d.id === dishId);
    if (!dish) return null;
    const byId = new Map(ingredients.map((i) => [i.id, i]));
    const plan = customPlanDish(dish, stages);
    return {
      dish: plan,
      description: '',
      imageUrl: null,
      tool: '',
      contentVersion: 1,
      reviewedBy: null,
      variants: plan.variants.map((v) => ({ ...v, portionMl: null })),
      lines: dish.lines.map((line) => {
        const ingredient = byId.get(line.ingredientId)!;
        return {
          ingredientId: line.ingredientId,
          name: ingredient.name,
          qty: line.qty,
          unit: line.unit,
          isMain: line.isMain,
          foodGroup: ingredient.foodGroup,
          allergenTags: ingredient.allergenTags,
        };
      }),
      steps: dish.steps,
      safetyNotes: CUSTOM_SAFETY_NOTES,
    };
  }
}
