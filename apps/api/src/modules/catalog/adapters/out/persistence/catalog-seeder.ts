import type { PrismaService } from '../../../../../shared/infrastructure/prisma/prisma.service.js';
import type { CatalogInput } from '../../../domain/catalog-validation.js';
import { toSearchText } from '../../../../../shared/kernel/search-text.js';

/**
 * Upserts the catalog in one transaction. Dishes are replaced only when their content version
 * increases, so re-running the seed is harmless and never downgrades reviewed content.
 */
// A batch job of ~100 sequential statements: Prisma's 5 s interactive default is too tight
// on a busy database, and a half-applied catalog is worse than a slow seed.
const SEED_TRANSACTION = { maxWait: 10_000, timeout: 120_000 };

export async function seedCatalog(prisma: PrismaService, catalog: CatalogInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const stage of catalog.stages) {
      await tx.stage.upsert({ where: { id: stage.id }, create: stage, update: stage });
    }

    for (const { chokingRisk, proteinSource, ...ingredient } of catalog.ingredients) {
      const data = {
        ...ingredient,
        proteinSource: proteinSource ?? null,
        chokingRisk: chokingRisk ?? false,
        searchText: toSearchText([ingredient.name, ...ingredient.aliases].join(' ')),
      };
      await tx.ingredient.upsert({ where: { id: ingredient.id }, create: data, update: data });
    }

    for (const { stages: _stages, variants, ingredients, mainProtein, ...dish } of catalog.dishes) {
      const existing = await tx.dish.findUnique({ where: { id: dish.id } });
      if (existing && existing.contentVersion >= dish.contentVersion) continue;

      const data = {
        ...dish,
        mainProtein: mainProtein ?? null,
        searchText: toSearchText(dish.name),
      };
      await tx.dishIngredient.deleteMany({ where: { dishId: dish.id } });
      await tx.dishStageVariant.deleteMany({ where: { dishId: dish.id } });
      await tx.dish.upsert({ where: { id: dish.id }, create: data, update: data });
      await tx.dishIngredient.createMany({
        data: ingredients.map((line) => ({ dishId: dish.id, ...line })),
      });
      await tx.dishStageVariant.createMany({
        data: variants.map(({ stage, ...variant }) => ({
          dishId: dish.id,
          stageId: stage,
          ...variant,
        })),
      });
    }
  }, SEED_TRANSACTION);
}
