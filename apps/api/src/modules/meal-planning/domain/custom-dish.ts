import { toSearchText } from '../../../shared/kernel/search-text.js';
import { InvalidCustomDishError, UnknownDishIngredientError } from './errors.js';
import type {
  MealType,
  PlanDish,
  PlanIngredient,
  PlanningContext,
  ProteinSource,
  StageId,
  Texture,
} from './model.js';

export const CUSTOM_DISH_LIMIT = 50;
export const CUSTOM_DISH_PREFIX = 'custom_';
const NAME_MIN = 2;
const NAME_MAX = 60;
const MAX_INGREDIENTS = 15;
const MAX_QTY = 9999;
const UNIT_MAX = 12;
const PREP_MAX = 180;
const COOK_MAX = 240;
const MAX_STEPS = 15;
const STEP_MAX = 300;

export interface CustomDishInput {
  name: string;
  mealType: MealType;
  ingredients: { id: string; qty?: number | null; unit?: string | null }[];
  prepMin: number;
  cookMin: number;
  steps: string[];
}

export interface CustomDishLine {
  ingredientId: string;
  qty: number | null;
  unit: string | null;
  isMain: boolean;
}

/** A validated "Món của bạn", ready to store (BR-81, BR-84, BR-87). */
export interface CustomDishDraft {
  name: string;
  /** Accent- and case-free name: two dishes of a child may not share it (BR-87). */
  nameKey: string;
  mealType: MealType;
  lines: CustomDishLine[];
  mainProtein: ProteinSource | null;
  prepMin: number;
  cookMin: number;
  steps: string[];
}

const length = (text: string) => [...text].length;
const clean = (text: string) => text.normalize('NFC').trim();
const isWhole = (n: number, max: number) => Number.isInteger(n) && n >= 0 && n <= max;

/** BR-84: proteins carry the dish; without one, vegetables and fruit; otherwise everything. */
function mainIds(ids: string[], ingredients: ReadonlyMap<string, PlanIngredient>): Set<string> {
  const inGroups = (groups: string[]) =>
    ids.filter((id) => groups.includes(ingredients.get(id)!.foodGroup));
  const proteins = inGroups(['protein']);
  if (proteins.length > 0) return new Set(proteins);
  const produce = inGroups(['veg', 'fruit']);
  return new Set(produce.length > 0 ? produce : ids);
}

export function buildCustomDish(
  input: CustomDishInput,
  ingredients: ReadonlyMap<string, PlanIngredient>,
): CustomDishDraft {
  const name = clean(input.name);
  if (length(name) < NAME_MIN || length(name) > NAME_MAX) throw new InvalidCustomDishError('name');

  const seen = new Set<string>();
  const items = input.ingredients.filter((item) => !seen.has(item.id) && seen.add(item.id));
  if (items.length === 0 || items.length > MAX_INGREDIENTS) {
    throw new InvalidCustomDishError('ingredients');
  }
  const unknown = items.map((i) => i.id).filter((id) => !ingredients.has(id));
  if (unknown.length > 0) throw new UnknownDishIngredientError(unknown);

  if (!isWhole(input.prepMin, PREP_MAX)) throw new InvalidCustomDishError('prepMin');
  if (!isWhole(input.cookMin, COOK_MAX)) throw new InvalidCustomDishError('cookMin');
  if (input.prepMin + input.cookMin < 1) throw new InvalidCustomDishError('cookMin');

  const steps = input.steps.map(clean).filter((step) => step !== '');
  if (steps.length > MAX_STEPS || steps.some((step) => length(step) > STEP_MAX)) {
    throw new InvalidCustomDishError('steps');
  }

  const ids = items.map((i) => i.id);
  const mains = mainIds(ids, ingredients);
  const lines = items.map((item): CustomDishLine => {
    const qty = item.qty ?? null;
    if (qty !== null && !(Number.isFinite(qty) && qty > 0 && qty <= MAX_QTY)) {
      throw new InvalidCustomDishError('qty');
    }
    const unit = item.unit ? clean(item.unit) : '';
    if (length(unit) > UNIT_MAX) throw new InvalidCustomDishError('unit');
    return { ingredientId: item.id, qty, unit: unit || null, isMain: mains.has(item.id) };
  });
  const firstProtein = ids.find((id) => ingredients.get(id)!.proteinSource !== null);

  return {
    name,
    nameKey: toSearchText(name),
    mealType: input.mealType,
    lines,
    mainProtein: firstProtein ? ingredients.get(firstProtein)!.proteinSource : null,
    prepMin: input.prepMin,
    cookMin: input.cookMin,
    steps,
  };
}

export type UnsafeReason = 'allergen' | 'avoid' | 'paused' | 'age';

/**
 * BR-82: the foods that would make this dish unsafe for the child right now, with the first rule
 * each breaks (same order as the hard filter). Refusals and sickness do not block creating a dish.
 */
export function unsafeIngredients(
  ingredientIds: string[],
  ctx: Pick<
    PlanningContext,
    'ingredients' | 'avoidAllergens' | 'avoidIngredients' | 'paused' | 'ageMonths'
  >,
): { id: string; reason: UnsafeReason }[] {
  const found: { id: string; reason: UnsafeReason }[] = [];
  for (const id of ingredientIds) {
    const ingredient = ctx.ingredients.get(id)!;
    const reason: UnsafeReason | null = ingredient.allergenTags.some((t) =>
      ctx.avoidAllergens.has(t),
    )
      ? 'allergen'
      : ctx.avoidIngredients.has(id)
        ? 'avoid'
        : ctx.paused.has(id)
          ? 'paused'
          : ingredient.minAgeMonths > ctx.ageMonths
            ? 'age'
            : null;
    if (reason) found.push({ id, reason });
  }
  return found;
}

/** A stored "Món của bạn" (the draft plus what storage adds). */
export interface CustomDish extends CustomDishDraft {
  id: string;
  childId: string;
  archivedAt: Date | null;
}

export interface StageDefault {
  stage: StageId;
  texture: Texture;
  /** The stage's main-meal portion. */
  portionText: string;
}

/** Snack portions of the catalog's snacks, by stage: parents' snacks follow them (BR-83). */
export const CUSTOM_SNACK_PORTIONS: Record<StageId, string> = {
  1: '1–2 thìa',
  2: '60–80 ml',
  3: 'Khoảng 80 ml',
  4: '80–100 ml',
};

/** BR-83: usable at every stage, with that stage's texture and portion. */
export function customPlanDish(dish: CustomDish, stages: StageDefault[]): PlanDish {
  return {
    id: dish.id,
    name: dish.name,
    mealType: dish.mealType,
    prepMin: dish.prepMin,
    cookMin: dish.cookMin,
    mainProtein: dish.mainProtein,
    stages: stages.map((s) => s.stage),
    variants: stages.map((s) => ({
      stage: s.stage,
      texture: s.texture,
      portionText: dish.mealType === 'snack' ? CUSTOM_SNACK_PORTIONS[s.stage] : s.portionText,
    })),
    ingredientIds: dish.lines.map((l) => l.ingredientId),
    mainIngredientIds: dish.lines.filter((l) => l.isMain).map((l) => l.ingredientId),
    custom: true,
    archived: dish.archivedAt !== null,
  };
}
