import { z } from 'zod';

const ALLERGENS = [
  'egg',
  'cow_milk',
  'peanut',
  'shellfish',
  'fish',
  'wheat',
  'soy',
  'sesame',
  'tree_nut',
] as const;
const PROTEINS = ['fish', 'chicken', 'beef', 'pork', 'legume', 'egg'] as const;
const TEXTURES = ['puree_smooth', 'mashed', 'lumpy', 'minced_soft', 'family'] as const;
const SLOTS = [
  'breakfast',
  'morning_snack',
  'lunch',
  'afternoon_snack',
  'dinner',
  'extra_snack',
] as const;

const stageSchema = z.object({
  id: z.number().int().min(1).max(4),
  name: z.string().min(1),
  ageFromMonths: z.number().int(),
  ageToMonths: z.number().int(),
  texture: z.enum(TEXTURES),
  portionText: z.string().min(1),
  mainMeals: z.number().int().min(1),
  snacksMin: z.number().int().min(0),
  snacksMax: z.number().int().min(0),
  defaultSchedule: z.array(
    z.object({ slot: z.enum(SLOTS), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }),
  ),
});

const ingredientSchema = z.object({
  id: z.string().regex(/^ing_[a-z0-9_]+$/),
  name: z.string().min(1),
  aliases: z.array(z.string()),
  foodGroup: z.enum(['carb', 'protein', 'fat', 'veg', 'fruit', 'seasoning']),
  proteinSource: z.enum(PROTEINS).optional(),
  allergenTags: z.array(z.enum(ALLERGENS)),
  minAgeMonths: z.number().int().min(6),
  chokingRisk: z.boolean().optional(),
});

const dishSchema = z.object({
  id: z.string().regex(/^dish_[a-z0-9_]+$/),
  name: z.string().min(1),
  description: z.string(),
  imageUrl: z.string().optional(),
  mealType: z.enum(['main', 'snack']),
  prepMin: z.number().int().min(0),
  cookMin: z.number().int().min(0),
  tool: z.string().min(1),
  mainProtein: z.enum(PROTEINS).optional(),
  stages: z.array(z.number().int()),
  variants: z.array(
    z.object({
      stage: z.number().int(),
      texture: z.enum(TEXTURES),
      portionText: z.string().min(1),
      portionMl: z.number().int().positive().optional(),
    }),
  ),
  ingredients: z.array(
    z.object({
      ingredientId: z.string(),
      qty: z.number().positive(),
      unit: z.string().min(1),
      isMain: z.boolean(),
    }),
  ),
  steps: z.array(z.string().min(1)),
  safetyNotes: z.array(z.string()),
  contentVersion: z.number().int().min(1),
  reviewedBy: z.string().optional(),
  status: z.enum(['draft', 'published']),
});

export const catalogSchema = z.object({
  stages: z.array(stageSchema),
  ingredients: z.array(ingredientSchema),
  dishes: z.array(dishSchema),
});

export type CatalogInput = z.infer<typeof catalogSchema>;

/** Returns every problem found (empty = valid). Run in CI and before seeding (TC-DB-004). */
export function validateCatalog(
  input: CatalogInput,
  options: { production?: boolean } = {},
): string[] {
  const parsed = catalogSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map((i) => `schema: ${i.path.join('.')}: ${i.message}`);
  }
  const { stages, ingredients, dishes } = parsed.data;
  const problems: string[] = [];

  const duplicates = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) problems.push(`${kind} ${id}: id trùng lặp`);
      seen.add(id);
    }
  };
  duplicates(
    'ingredient',
    ingredients.map((i) => i.id),
  );
  duplicates(
    'dish',
    dishes.map((d) => d.id),
  );

  const stageById = new Map(stages.map((s) => [s.id, s]));
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

  for (const dish of dishes) {
    const problem = (message: string) => problems.push(`dish ${dish.id}: ${message}`);

    if (dish.steps.length === 0) problem('cần ít nhất 1 bước');
    if (dish.ingredients.length === 0) problem('cần ít nhất 1 nguyên liệu');
    if (options.production && dish.status === 'draft') {
      problem('đang ở trạng thái draft, không được phát hành');
    }

    for (const stage of dish.stages) {
      if (!stageById.has(stage)) problem(`giai đoạn ${stage} không tồn tại`);
      if (!dish.variants.some((v) => v.stage === stage))
        problem(`thiếu biến thể cho giai đoạn ${stage}`);
    }
    for (const variant of dish.variants) {
      if (!dish.stages.includes(variant.stage)) {
        problem(`biến thể cho giai đoạn ${variant.stage} không được khai báo`);
      }
    }

    const youngest = Math.min(
      ...dish.stages.map((s) => stageById.get(s)?.ageFromMonths ?? Number.POSITIVE_INFINITY),
    );
    const proteins = new Set<string>();
    for (const line of dish.ingredients) {
      const ingredient = ingredientById.get(line.ingredientId);
      if (!ingredient) {
        problem(`nguyên liệu ${line.ingredientId} không tồn tại`);
        continue;
      }
      if (ingredient.proteinSource) proteins.add(ingredient.proteinSource);
      if (ingredient.minAgeMonths > youngest) {
        const stage = dish.stages.find((s) => stageById.get(s)?.ageFromMonths === youngest);
        problem(
          `nguyên liệu ${ingredient.id} chỉ dùng từ ${ingredient.minAgeMonths} tháng, món có giai đoạn ${stage} (từ ${youngest} tháng)`,
        );
      }
    }

    if (dish.mealType === 'main') {
      if (!dish.mainProtein) problem('bữa chính cần nguồn đạm chính');
      else if (!proteins.has(dish.mainProtein)) {
        problem(`nguồn đạm chính ${dish.mainProtein} không có trong nguyên liệu`);
      }
    }
  }
  return problems;
}
