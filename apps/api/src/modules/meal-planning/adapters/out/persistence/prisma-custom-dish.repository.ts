import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import type { PrismaTransactionHost } from '../../../../../shared/infrastructure/persistence/transaction-host.js';
import type { CustomDishRepository } from '../../../application/ports/out/custom-dish.repository.js';
import type { CustomDish } from '../../../domain/custom-dish.js';

const include = { ingredients: { orderBy: { position: 'asc' } } } as const;
type Row = Prisma.DishGetPayload<{ include: typeof include }>;

const toDomain = (row: Row): CustomDish => ({
  id: row.id,
  childId: row.ownerChildId!,
  name: row.name,
  // Stored in search_text: accent- and case-free, what name clashes are checked on (BR-87).
  nameKey: row.searchText,
  mealType: row.mealType,
  lines: row.ingredients.map((line) => ({
    ingredientId: line.ingredientId,
    qty: line.qty === null ? null : Number(line.qty),
    unit: line.unit,
    isMain: line.isMain,
  })),
  mainProtein: row.mainProtein,
  prepMin: row.prepMin,
  cookMin: row.cookMin,
  steps: row.steps as string[],
  archivedAt: row.archivedAt,
});

const lines = (dish: CustomDish) => ({
  create: dish.lines.map((line, position) => ({
    ingredientId: line.ingredientId,
    qty: line.qty,
    unit: line.unit,
    isMain: line.isMain,
    position,
  })),
});

/** "Món của bạn" share the dishes table (planned meals point at them), marked by their owner. */
@Injectable()
export class PrismaCustomDishRepository implements CustomDishRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: PrismaTransactionHost) {}

  async listForChild(childId: string): Promise<CustomDish[]> {
    const rows = await this.txHost.tx.dish.findMany({
      where: { ownerChildId: childId },
      include,
      orderBy: { id: 'asc' },
    });
    return rows.map(toDomain);
  }

  async create(dish: CustomDish, createdBy: string): Promise<void> {
    await this.txHost.tx.dish.create({
      data: {
        id: dish.id,
        name: dish.name,
        description: '',
        mealType: dish.mealType,
        prepMin: dish.prepMin,
        cookMin: dish.cookMin,
        tool: '',
        mainProtein: dish.mainProtein,
        steps: dish.steps,
        safetyNotes: [],
        contentVersion: 1,
        status: 'published',
        searchText: dish.nameKey,
        ownerChildId: dish.childId,
        createdBy,
        ingredients: lines(dish),
      },
    });
  }

  async update(dish: CustomDish): Promise<void> {
    await this.txHost.tx.dishIngredient.deleteMany({ where: { dishId: dish.id } });
    await this.txHost.tx.dish.update({
      where: { id: dish.id },
      data: {
        name: dish.name,
        mealType: dish.mealType,
        prepMin: dish.prepMin,
        cookMin: dish.cookMin,
        mainProtein: dish.mainProtein,
        steps: dish.steps,
        searchText: dish.nameKey,
        ingredients: lines(dish),
      },
    });
  }

  async archive(dishId: string, at: Date): Promise<void> {
    await this.txHost.tx.dish.update({ where: { id: dishId }, data: { archivedAt: at } });
  }
}
