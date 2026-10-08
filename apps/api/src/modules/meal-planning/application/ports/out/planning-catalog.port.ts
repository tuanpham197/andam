import type { StageDefault } from '../../../domain/custom-dish.js';
import type { StageSchedule } from '../../../domain/menu-engine.js';
import type {
  Allergen,
  FoodGroup,
  PlanDish,
  PlanIngredient,
  StageId,
  Texture,
} from '../../../domain/model.js';

export const PLANNING_CATALOG = Symbol('PLANNING_CATALOG');

export interface Recipe {
  dish: PlanDish;
  description: string;
  imageUrl: string | null;
  tool: string;
  contentVersion: number;
  reviewedBy: string | null;
  variants: { stage: StageId; texture: Texture; portionText: string; portionMl: number | null }[];
  lines: {
    ingredientId: string;
    name: string;
    /** Null for a "Món của bạn" line the parent did not weigh (BR-81). */
    qty: number | null;
    unit: string | null;
    isMain: boolean;
    foodGroup: FoodGroup;
    allergenTags: Allergen[];
  }[];
  steps: string[];
  safetyNotes: string[];
}

export interface PlanningCatalog {
  dishes(): Promise<PlanDish[]>;
  ingredients(): Promise<PlanIngredient[]>;
  schedule(stage: StageId): Promise<StageSchedule>;
  /** Texture and main-meal portion of each stage, for parents' dishes (BR-83). */
  stageDefaults(): Promise<StageDefault[]>;
  recipe(dishId: string): Promise<Recipe | null>;
}
