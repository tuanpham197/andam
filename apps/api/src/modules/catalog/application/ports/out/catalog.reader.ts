export const CATALOG_READER = Symbol('CATALOG_READER');

export interface StageView {
  id: number;
  name: string;
  ageFromMonths: number;
  ageToMonths: number;
  texture: string;
  portionText: string;
  mainMeals: number;
  snacksMin: number;
  snacksMax: number;
}

export interface IngredientView {
  id: string;
  name: string;
  foodGroup: string;
  proteinSource: string | null;
  allergenTags: string[];
}

export interface DishVariantView {
  stage: number;
  texture: string;
  portionText: string;
  portionMl: number | null;
}

export interface DishView {
  id: string;
  name: string;
  mealType: 'main' | 'snack';
  prepMin: number;
  cookMin: number;
  mainProtein: string | null;
  stages: number[];
  variants: DishVariantView[];
  ingredientIds: string[];
  /** The ingredients the dish is built around (`isMain`), e.g. the salmon of a salmon porridge. */
  mainIngredientIds: string[];
}

export interface IngredientDetailView {
  id: string;
  name: string;
  foodGroup: string;
  proteinSource: string | null;
  allergenTags: string[];
  minAgeMonths: number;
}

export interface StageScheduleView {
  mainMeals: number;
  snacksMin: number;
  schedule: { slot: string; time: string }[];
}

export interface RecipeDetailView {
  id: string;
  description: string;
  imageUrl: string | null;
  tool: string;
  contentVersion: number;
  reviewedBy: string | null;
  lines: {
    ingredientId: string;
    name: string;
    qty: number;
    unit: string;
    isMain: boolean;
    foodGroup: string;
    allergenTags: string[];
  }[];
  steps: string[];
  safetyNotes: string[];
}

export interface CatalogReader {
  listDishes(): Promise<DishView[]>;
  listIngredients(): Promise<IngredientDetailView[]>;
  stageSchedule(stageId: number): Promise<StageScheduleView>;
  recipe(dishId: string): Promise<RecipeDetailView | null>;
  listStages(): Promise<StageView[]>;
  findIngredientsByIds(ids: string[]): Promise<{ id: string; name: string }[]>;
  /** `searchText` is already accent-free and lowercase; results are ranked, at most `limit`. */
  searchIngredients(searchText: string, limit: number): Promise<IngredientView[]>;
}
