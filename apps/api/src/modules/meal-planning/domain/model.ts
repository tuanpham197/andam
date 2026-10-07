import type { LocalDate } from '../../../shared/kernel/local-date.js';

export type StageId = 1 | 2 | 3 | 4;
export type Allergen =
  'egg' | 'cow_milk' | 'peanut' | 'shellfish' | 'fish' | 'wheat' | 'soy' | 'sesame' | 'tree_nut';
export type FoodGroup = 'carb' | 'protein' | 'fat' | 'veg' | 'fruit' | 'seasoning';
export type ProteinSource = 'fish' | 'chicken' | 'beef' | 'pork' | 'legume' | 'egg';
export type Texture = 'puree_smooth' | 'mashed' | 'lumpy' | 'minced_soft' | 'family';
export type MealType = 'main' | 'snack';
export type MealSlot =
  'breakfast' | 'morning_snack' | 'lunch' | 'afternoon_snack' | 'dinner' | 'extra_snack';
export type EatAmount = 'none' | 'few_spoons' | 'quarter' | 'half' | 'almost_all' | 'all';
export type HealthState = 'normal' | 'sick' | 'recovering';

export interface PlanIngredient {
  id: string;
  name: string;
  foodGroup: FoodGroup;
  proteinSource: ProteinSource | null;
  allergenTags: Allergen[];
  minAgeMonths: number;
}

export interface PlanDish {
  id: string;
  name: string;
  mealType: MealType;
  prepMin: number;
  cookMin: number;
  mainProtein: ProteinSource | null;
  stages: StageId[];
  variants: { stage: StageId; texture: Texture; portionText: string }[];
  ingredientIds: string[];
  /** What the dish is built around; swapping for a missing or disliked food avoids these (BR-28/29). */
  mainIngredientIds: string[];
}

export interface ScheduledSlot {
  slot: MealSlot;
  time: string;
}

export interface DishFeedback {
  liking: number;
  amount: EatAmount;
  date: LocalDate;
}

/** Everything the engine needs about one child on one day; built by the application layer. */
export interface PlanningContext {
  childId: string;
  ageMonths: number;
  stage: StageId;
  health: HealthState;
  avoidAllergens: ReadonlySet<Allergen>;
  avoidIngredients: ReadonlySet<string>;
  paused: ReadonlySet<string>;
  /** Ingredients eaten without a reaction (BR-44). */
  tried: ReadonlySet<string>;
  ingredients: ReadonlyMap<string, PlanIngredient>;
  dishes: readonly PlanDish[];
  /** Latest feedback per dish id. */
  feedback: ReadonlyMap<string, DishFeedback>;
}

export interface MealUse {
  date: LocalDate;
  slot: MealSlot;
  dishId: string;
}
