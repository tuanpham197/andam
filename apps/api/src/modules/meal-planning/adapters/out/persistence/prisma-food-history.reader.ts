import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { PrismaTransactionHost } from '../../../../../shared/infrastructure/persistence/transaction-host.js';
import { ChildHealthQueries } from '../../../../child-health/application/use-cases/child-health.service.js';
import {
  APP_TIMEZONE,
  toLocalDate,
  type LocalDate,
} from '../../../../../shared/kernel/local-date.js';
import type { FoodHistoryReader } from '../../../application/ports/out/food-history.reader.js';
import type { DishFeedback, HealthState } from '../../../domain/model.js';
import { displayName } from '../../../../child-profile/domain/membership.js';

/**
 * Read model over what other modules record (logs, exposures, pauses); health comes from the
 * child-health module. Reads through the current transaction: a food paused a moment ago in the
 * same unit of work must already be excluded when upcoming meals are planned again (BR-31).
 */
@Injectable()
export class PrismaFoodHistoryReader implements FoodHistoryReader {
  constructor(
    @Inject(TransactionHost) private readonly txHost: PrismaTransactionHost,
    @Inject(ChildHealthQueries) private readonly healthQueries: ChildHealthQueries,
  ) {}

  private get prisma() {
    return this.txHost.tx;
  }

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

  async loggedBy(mealIds: string[]): Promise<Map<string, { name: string | null; at: Date }>> {
    if (mealIds.length === 0) return new Map();
    const rows = await this.prisma.mealLog.findMany({
      where: { mealId: { in: mealIds } },
      select: {
        mealId: true,
        loggedAt: true,
        actor: { select: { displayName: true, email: true } },
      },
    });
    return new Map(
      rows.map((r) => [
        r.mealId,
        { name: r.actor && displayName(r.actor.displayName, r.actor.email), at: r.loggedAt },
      ]),
    );
  }

  health(childId: string, date: LocalDate): Promise<HealthState> {
    return this.healthQueries.statusOn(childId, date);
  }
}
