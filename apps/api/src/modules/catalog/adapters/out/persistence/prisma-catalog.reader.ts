import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../shared/infrastructure/prisma/prisma.service.js';
import type {
  CatalogReader,
  DishView,
  IngredientDetailView,
  IngredientView,
  RecipeDetailView,
  StageScheduleView,
  StageView,
} from '../../../application/ports/out/catalog.reader.js';

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

// Below this trigram similarity a non-substring match is noise.
const MIN_SIMILARITY = 0.3;

@Injectable()
export class PrismaCatalogReader implements CatalogReader {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  listStages(): Promise<StageView[]> {
    return this.prisma.stage.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        ageFromMonths: true,
        ageToMonths: true,
        texture: true,
        portionText: true,
        mainMeals: true,
        snacksMin: true,
        snacksMax: true,
      },
    });
  }

  async listDishes(): Promise<DishView[]> {
    const rows = await this.prisma.dish.findMany({
      include: { variants: { orderBy: { stageId: 'asc' } }, ingredients: true },
      orderBy: { id: 'asc' },
    });
    return rows.map((d) => ({
      id: d.id,
      name: d.name,
      mealType: d.mealType,
      prepMin: d.prepMin,
      cookMin: d.cookMin,
      mainProtein: d.mainProtein,
      stages: d.variants.map((v) => v.stageId),
      variants: d.variants.map((v) => ({
        stage: v.stageId,
        texture: v.texture,
        portionText: v.portionText,
        portionMl: v.portionMl,
      })),
      ingredientIds: d.ingredients.map((i) => i.ingredientId),
      mainIngredientIds: d.ingredients.filter((i) => i.isMain).map((i) => i.ingredientId),
    }));
  }

  listIngredients(): Promise<IngredientDetailView[]> {
    return this.prisma.ingredient.findMany({
      select: {
        id: true,
        name: true,
        foodGroup: true,
        proteinSource: true,
        allergenTags: true,
        minAgeMonths: true,
      },
      orderBy: { id: 'asc' },
    });
  }

  async stageSchedule(stageId: number): Promise<StageScheduleView> {
    const stage = await this.prisma.stage.findUniqueOrThrow({ where: { id: stageId } });
    return {
      mainMeals: stage.mainMeals,
      snacksMin: stage.snacksMin,
      schedule: stage.defaultSchedule as StageScheduleView['schedule'],
    };
  }

  async recipe(dishId: string): Promise<RecipeDetailView | null> {
    const dish = await this.prisma.dish.findUnique({
      where: { id: dishId },
      include: { ingredients: { include: { ingredient: true } } },
    });
    if (!dish) return null;
    return {
      id: dish.id,
      description: dish.description,
      imageUrl: dish.imageUrl,
      tool: dish.tool,
      contentVersion: dish.contentVersion,
      reviewedBy: dish.reviewedBy,
      lines: dish.ingredients.map((line) => ({
        ingredientId: line.ingredientId,
        name: line.ingredient.name,
        qty: Number(line.qty),
        unit: line.unit,
        isMain: line.isMain,
        foodGroup: line.ingredient.foodGroup,
        allergenTags: line.ingredient.allergenTags,
      })),
      steps: dish.steps as string[],
      safetyNotes: dish.safetyNotes,
    };
  }

  async findIngredientsByIds(ids: string[]): Promise<{ id: string; name: string }[]> {
    if (ids.length === 0) return [];
    return this.prisma.ingredient.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
  }

  searchIngredients(searchText: string, limit: number): Promise<IngredientView[]> {
    const escaped = escapeLike(searchText);
    const prefix = `${escaped}%`;
    const contains = `%${escaped}%`;
    // Parameterised: user input never becomes SQL (TC-ING-004).
    return this.prisma.$queryRaw<IngredientView[]>`
      SELECT id, name,
             food_group::text AS "foodGroup",
             protein_source::text AS "proteinSource",
             allergen_tags::text[] AS "allergenTags"
      FROM ingredients
      WHERE search_text LIKE ${contains} ESCAPE '\\'
         OR similarity(search_text, ${searchText}) > ${MIN_SIMILARITY}
      ORDER BY CASE
                 WHEN search_text LIKE ${prefix} ESCAPE '\\' THEN 0
                 WHEN search_text LIKE ${contains} ESCAPE '\\' THEN 1
                 ELSE 2
               END,
               similarity(search_text, ${searchText}) DESC,
               name
      LIMIT ${limit}`;
  }
}
