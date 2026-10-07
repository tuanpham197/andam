export const INGREDIENT_LOOKUP = Symbol('INGREDIENT_LOOKUP');

export interface IngredientLookup {
  /** Returns only the ids that exist in the catalog, with their display names. */
  findByIds(ids: string[]): Promise<{ id: string; name: string }[]>;
}
