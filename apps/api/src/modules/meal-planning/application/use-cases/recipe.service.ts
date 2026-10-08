import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import { APP_TIMEZONE, toLocalDate } from '../../../../shared/kernel/local-date.js';
import { DishNotFoundError, PlanChildNotFoundError } from '../../domain/errors.js';
import type { Allergen, FoodGroup, MealType, StageId, Texture } from '../../domain/model.js';
import { newIngredientIds } from '../../domain/novelty.js';
import { exclusionReason, type ExclusionReason } from '../../domain/safety-filter.js';
import {
  CHILD_PLANNING_READER,
  type ChildPlanningReader,
} from '../ports/out/child-planning.reader.js';
import { FOOD_HISTORY_READER, type FoodHistoryReader } from '../ports/out/food-history.reader.js';
import { PlanningDishes } from './planning-dishes.js';
import { foodGroupsOf, loadPlanningContext, type ViewGroup } from './planning-context.js';

export interface RecipeView {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  mealType: MealType;
  prepMin: number;
  cookMin: number;
  tool: string;
  contentVersion: number;
  reviewedBy: string | null;
  /** "Món của bạn": made by the parents, not reviewed (BR-85). */
  custom: boolean;
  stages: StageId[];
  selectedStage: StageId;
  variants: { stage: StageId; texture: Texture; portionText: string; portionMl: number | null }[];
  ingredients: {
    ingredientId: string;
    name: string;
    qty: number | null;
    unit: string | null;
    isMain: boolean;
    foodGroup: FoodGroup;
    allergenTags: Allergen[];
    isNew: boolean;
  }[];
  steps: string[];
  safetyNotes: string[];
  /** Common allergens the dish contains (FR-029). */
  allergens: Allergen[];
  foodGroups: ViewGroup[];
  /** Why this dish is not safe for the child right now, or null (opened from the library). */
  exclusion: ExclusionReason | null;
}

@Injectable()
export class RecipeService {
  constructor(
    @Inject(CHILD_PLANNING_READER) private readonly children: ChildPlanningReader,
    @Inject(PlanningDishes) private readonly catalog: PlanningDishes,
    @Inject(FOOD_HISTORY_READER) private readonly history: FoodHistoryReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async get(userId: string, childId: string, dishId: string, stage?: number): Promise<RecipeView> {
    const child = await this.children.find(childId, userId);
    if (!child) throw new PlanChildNotFoundError();
    const recipe = await this.catalog.recipe(childId, dishId);
    if (!recipe) throw new DishNotFoundError();

    const supported = recipe.dish.stages;
    const selectedStage =
      supported.find((s) => s === stage) ??
      supported.find((s) => s === child.stage) ??
      supported[0]!;
    const today = toLocalDate(this.clock.now(), APP_TIMEZONE);
    const { ctx } = await loadPlanningContext(
      this.catalog,
      this.history,
      child,
      child.stage ?? selectedStage,
      today,
    );
    const firstTries = new Set(newIngredientIds(recipe.dish, ctx));

    return {
      id: recipe.dish.id,
      name: recipe.dish.name,
      description: recipe.description,
      imageUrl: recipe.imageUrl,
      mealType: recipe.dish.mealType,
      prepMin: recipe.dish.prepMin,
      cookMin: recipe.dish.cookMin,
      tool: recipe.tool,
      contentVersion: recipe.contentVersion,
      reviewedBy: recipe.reviewedBy,
      custom: recipe.dish.custom === true,
      stages: supported,
      selectedStage,
      variants: recipe.variants,
      ingredients: recipe.lines.map((line) => ({
        ...line,
        isNew: firstTries.has(line.ingredientId),
      })),
      steps: recipe.steps,
      safetyNotes: recipe.safetyNotes,
      allergens: [...new Set(recipe.lines.flatMap((l) => l.allergenTags))],
      foodGroups: foodGroupsOf(recipe.dish.ingredientIds, ctx.ingredients),
      exclusion: child.stage === null ? null : exclusionReason(recipe.dish, ctx, today),
    };
  }
}
