import { Inject, Injectable } from '@nestjs/common';
import {
  CATALOG_READER,
  type CatalogReader,
  type DishView,
} from '../../../../catalog/application/ports/out/catalog.reader.js';
import type {
  PlanningCatalog,
  Recipe,
} from '../../../application/ports/out/planning-catalog.port.js';
import type { StageDefault } from '../../../domain/custom-dish.js';
import type { StageSchedule } from '../../../domain/menu-engine.js';
import type { PlanDish, PlanIngredient, StageId } from '../../../domain/model.js';

const toPlanDish = (d: DishView): PlanDish => ({
  id: d.id,
  name: d.name,
  mealType: d.mealType,
  prepMin: d.prepMin,
  cookMin: d.cookMin,
  mainProtein: d.mainProtein as PlanDish['mainProtein'],
  stages: d.stages as StageId[],
  variants: d.variants.map((v) => ({
    stage: v.stage as StageId,
    texture: v.texture as PlanDish['variants'][number]['texture'],
    portionText: v.portionText,
  })),
  ingredientIds: d.ingredientIds,
  mainIngredientIds: d.mainIngredientIds,
});

/** Anti-corruption layer: catalog data in the planning module's own vocabulary. */
@Injectable()
export class CatalogPlanningAdapter implements PlanningCatalog {
  constructor(@Inject(CATALOG_READER) private readonly catalog: CatalogReader) {}

  async dishes(): Promise<PlanDish[]> {
    return (await this.catalog.listDishes()).map(toPlanDish);
  }

  async ingredients(): Promise<PlanIngredient[]> {
    return (await this.catalog.listIngredients()) as PlanIngredient[];
  }

  async stageDefaults(): Promise<StageDefault[]> {
    return (await this.catalog.listStages()).map((s) => ({
      stage: s.id as StageId,
      texture: s.texture as StageDefault['texture'],
      portionText: s.portionText,
    }));
  }

  async schedule(stage: StageId): Promise<StageSchedule> {
    return (await this.catalog.stageSchedule(stage)) as StageSchedule;
  }

  async recipe(dishId: string): Promise<Recipe | null> {
    const [detail, dishes] = await Promise.all([
      this.catalog.recipe(dishId),
      this.catalog.listDishes(),
    ]);
    const dish = dishes.find((d) => d.id === dishId);
    if (!detail || !dish) return null;
    return {
      dish: toPlanDish(dish),
      description: detail.description,
      imageUrl: detail.imageUrl,
      tool: detail.tool,
      contentVersion: detail.contentVersion,
      reviewedBy: detail.reviewedBy,
      variants: dish.variants as Recipe['variants'],
      lines: detail.lines as Recipe['lines'],
      steps: detail.steps,
      safetyNotes: detail.safetyNotes,
    };
  }
}
