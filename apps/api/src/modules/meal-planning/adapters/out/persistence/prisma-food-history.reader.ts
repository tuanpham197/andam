import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../shared/infrastructure/prisma/prisma.service.js';
import {
  APP_TIMEZONE,
  toLocalDate,
  type LocalDate,
} from '../../../../../shared/kernel/local-date.js';
import type { FoodHistoryReader } from '../../../application/ports/out/food-history.reader.js';
import type { DishFeedback, HealthState } from '../../../domain/model.js';

/**
 * Reads what other modules record (logs, exposures, pauses, health episodes). Until those
 * modules exist (P5, P6) the tables are simply empty; then this adapter moves to their ports.
 */
@Injectable()
export class PrismaFoodHistoryReader implements FoodHistoryReader {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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

  async health(childId: string, date: LocalDate): Promise<HealthState> {
    const day = new Date(`${date}T00:00:00.000Z`);
    const episode = await this.prisma.healthEpisode.findFirst({
      where: {
        childId,
        endedAt: null,
        startDate: { lte: day },
        OR: [{ expectedEndDate: null }, { expectedEndDate: { gte: day } }],
      },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    });
    return episode?.status ?? 'normal';
  }
}
