import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../shared/infrastructure/prisma/prisma.service.js';
import { ChildHealthQueries } from '../../../../child-health/application/use-cases/child-health.service.js';
import {
  APP_TIMEZONE,
  toLocalDate,
  type LocalDate,
} from '../../../../../shared/kernel/local-date.js';
import type { FoodHistoryReader } from '../../../application/ports/out/food-history.reader.js';
import type { DishFeedback, HealthState } from '../../../domain/model.js';

/**
 * Reads what other modules record (logs, exposures, pauses). Until the meal-log and safety
 * modules exist (P5) the tables are simply empty; then this adapter moves to their ports.
 * Health comes from the child-health module, inside the caller's transaction.
 */
@Injectable()
export class PrismaFoodHistoryReader implements FoodHistoryReader {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ChildHealthQueries) private readonly healthQueries: ChildHealthQueries,
  ) {}

  async tried(childId: string): Promise<Set<string>> {
    const rows = await this.prisma.ingredientExposure.findMany({
      where: { childId, status: 'tried' },
      select: { ingredientId: true },
    });
    return new Set(rows.map((r) => r.ingredientId));
  }

  async paused(childId: string): Promise<Set<string>> {
    const rows = await this.prisma.pausedIngredient.findMany({
      where: { childId, resumedAt: null },
      select: { ingredientId: true },
    });
    return new Set(rows.map((r) => r.ingredientId));
  }

  async feedback(childId: string): Promise<Map<string, DishFeedback>> {
    const logs = await this.prisma.mealLog.findMany({
      where: { childId },
      orderBy: { loggedAt: 'asc' },
      select: { dishId: true, liking: true, amount: true, loggedAt: true },
    });
    const latest = new Map<string, DishFeedback>();
    for (const log of logs) {
      latest.set(log.dishId, {
        liking: log.liking,
        amount: log.amount,
        date: toLocalDate(log.loggedAt, APP_TIMEZONE),
      });
    }
    return latest;
  }

  async allergenIntroductions(
    childId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<LocalDate[]> {
    const rows = await this.prisma.ingredientExposure.findMany({
      where: {
        childId,
        firstTriedAt: { not: null },
        ingredient: { allergenTags: { isEmpty: false } },
      },
      select: { firstTriedAt: true },
    });
    return rows
      .map((r) => toLocalDate(r.firstTriedAt!, APP_TIMEZONE))
      .filter((date) => date >= from && date <= to);
  }

  health(childId: string, date: LocalDate): Promise<HealthState> {
    return this.healthQueries.statusOn(childId, date);
  }
}
