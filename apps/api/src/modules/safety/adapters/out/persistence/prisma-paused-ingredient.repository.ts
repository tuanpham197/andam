import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { PrismaTransactionHost } from '../../../../../shared/infrastructure/persistence/transaction-host.js';
import type {
  ActivePause,
  NewPause,
  PausedIngredientRepository,
} from '../../../application/ports/out/paused-ingredient.repository.js';

const mealSelect = {
  select: { date: true, slot: true, dish: { select: { name: true } } },
} as const;

@Injectable()
export class PrismaPausedIngredientRepository implements PausedIngredientRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: PrismaTransactionHost) {}

  async activeIds(childId: string): Promise<Set<string>> {
    const rows = await this.txHost.tx.pausedIngredient.findMany({
      where: { childId, resumedAt: null },
      select: { ingredientId: true },
    });
    return new Set(rows.map((r) => r.ingredientId));
  }

  async add(pauses: NewPause[]): Promise<void> {
    await this.txHost.tx.pausedIngredient.createMany({ data: pauses });
  }

  async listActive(childId: string): Promise<ActivePause[]> {
    const rows = await this.txHost.tx.pausedIngredient.findMany({
      where: { childId, resumedAt: null },
      orderBy: [{ pausedAt: 'desc' }, { id: 'asc' }],
      include: {
        ingredient: { select: { name: true } },
        sourceLog: { select: { meal: mealSelect } },
        sourceUrgent: { select: { meal: mealSelect } },
      },
    });
    return rows.map((row) => {
      const meal = row.sourceLog?.meal ?? row.sourceUrgent?.meal ?? null;
      return {
        id: row.id,
        ingredientId: row.ingredientId,
        name: row.ingredient.name,
        reason: row.reason,
        pausedAt: row.pausedAt,
        meal: meal && {
          date: meal.date.toISOString().slice(0, 10),
          slot: meal.slot,
          dishName: meal.dish.name,
        },
      };
    });
  }

  async resume(childId: string, ingredientId: string, at: Date, actorId: string): Promise<boolean> {
    // Conditional update: two parents confirming at once resume the pause only once.
    const { count } = await this.txHost.tx.pausedIngredient.updateMany({
      where: { childId, ingredientId, resumedAt: null },
      data: { resumedAt: at, resumedBy: actorId },
    });
    return count > 0;
  }
}
