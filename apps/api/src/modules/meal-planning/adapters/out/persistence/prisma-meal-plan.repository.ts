import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '../../../../../generated/prisma/client.js';
import type { PrismaTransactionHost } from '../../../../../shared/infrastructure/persistence/transaction-host.js';
import type { LocalDate } from '../../../../../shared/kernel/local-date.js';
import type { MealPlanRepository } from '../../../application/ports/out/meal-plan.repository.js';
import type { StageId } from '../../../domain/model.js';
import { PlannedMeal } from '../../../domain/planned-meal.js';
import type { SwapEvent } from '../../../domain/swap.js';

type Row = Prisma.PlannedMealGetPayload<object>;

const toDateColumn = (date: LocalDate) => new Date(`${date}T00:00:00.000Z`);

const toDomain = (row: Row) =>
  PlannedMeal.restore({
    id: row.id,
    childId: row.childId,
    date: row.date.toISOString().slice(0, 10),
    slot: row.slot,
    time: row.time,
    dishId: row.dishId,
    stageId: row.stageId as StageId,
    texture: row.texture,
    portionText: row.portionText,
    status: row.status,
    newIngredientIds: row.newIngredientIds,
    source: row.source,
    generatedAt: row.generatedAt,
  });

@Injectable()
export class PrismaMealPlanRepository implements MealPlanRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: PrismaTransactionHost) {}

  async findBetween(childId: string, from: LocalDate, to: LocalDate): Promise<PlannedMeal[]> {
    const rows = await this.txHost.tx.plannedMeal.findMany({
      where: { childId, date: { gte: toDateColumn(from), lte: toDateColumn(to) } },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    });
    return rows.map(toDomain);
  }

  async addMany(meals: PlannedMeal[]): Promise<boolean> {
    if (meals.length === 0) return true;
    try {
      // One statement: the whole batch is stored or none of it.
      await this.txHost.tx.plannedMeal.createMany({
        data: meals.map((m) => ({
          id: m.id,
          childId: m.childId,
          date: toDateColumn(m.date),
          slot: m.slot,
          time: m.time,
          dishId: m.dishId,
          stageId: m.stageId,
          texture: m.texture,
          portionText: m.portionText,
          status: m.status,
          newIngredientIds: m.newIngredientIds,
          source: m.source,
          generatedAt: m.generatedAt,
        })),
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return false;
      throw error;
    }
  }

  async findOwned(mealId: string, userId: string): Promise<PlannedMeal | null> {
    const row = await this.txHost.tx.plannedMeal.findFirst({
      where: { id: mealId, child: { userId } },
    });
    return row ? toDomain(row) : null;
  }

  async save(meal: PlannedMeal): Promise<void> {
    await this.txHost.tx.plannedMeal.update({
      where: { id: meal.id },
      data: {
        status: meal.status,
        dishId: meal.dishId,
        texture: meal.texture,
        portionText: meal.portionText,
        newIngredientIds: meal.newIngredientIds,
        source: meal.source,
      },
    });
  }

  async remove(mealIds: string[]): Promise<void> {
    if (mealIds.length === 0) return;
    await this.txHost.tx.plannedMeal.deleteMany({ where: { id: { in: mealIds } } });
  }

  async recordSwap(event: SwapEvent): Promise<void> {
    await this.txHost.tx.swapEvent.create({ data: event });
  }
}
