import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '../../../../../generated/prisma/client.js';
import type { PrismaTransactionHost } from '../../../../../shared/infrastructure/persistence/transaction-host.js';
import type { MealLogRepository } from '../../../application/ports/out/meal-log.repository.js';
import { MealLoggedTwiceError } from '../../../domain/errors.js';
import { MealLog, type ExposureUpdate } from '../../../domain/meal-log.js';
import { displayName } from '../../../../child-profile/domain/membership.js';

@Injectable()
export class PrismaMealLogRepository implements MealLogRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: PrismaTransactionHost) {}

  async findByMeal(mealId: string): Promise<MealLog | null> {
    const row = await this.txHost.tx.mealLog.findUnique({
      where: { mealId },
      include: { reaction: true },
    });
    if (!row) return null;
    return MealLog.restore({
      id: row.id,
      mealId: row.mealId,
      childId: row.childId,
      dishId: row.dishId,
      loggedAt: row.loggedAt,
      amount: row.amount,
      liking: row.liking,
      reaction: row.reaction && {
        symptoms: row.reaction.symptoms,
        severity: row.reaction.severity,
        note: row.reaction.note,
      },
      actorId: row.actorId,
    });
  }

  async whoLogged(mealId: string): Promise<{ name: string | null; at: Date } | null> {
    const row = await this.txHost.tx.mealLog.findUnique({
      where: { mealId },
      select: { loggedAt: true, actor: { select: { displayName: true, email: true } } },
    });
    if (!row) return null;
    return {
      name: row.actor && displayName(row.actor.displayName, row.actor.email),
      at: row.loggedAt,
    };
  }

  async add(log: MealLog): Promise<void> {
    try {
      await this.txHost.tx.mealLog.create({
        data: {
          id: log.id,
          mealId: log.mealId,
          childId: log.childId,
          dishId: log.dishId,
          loggedAt: log.loggedAt,
          amount: log.amount,
          liking: log.liking,
          actorId: log.actorId,
          reaction: log.reaction
            ? {
                create: {
                  // Only ever reached through its log; the domain never needs this id.
                  id: randomUUID(),
                  symptoms: log.reaction.symptoms,
                  severity: log.reaction.severity,
                  note: log.reaction.note,
                },
              }
            : undefined,
        },
      });
    } catch (error) {
      // UNIQUE(meal_id): a concurrent request logged this meal first (TC-LOG-005).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new MealLoggedTwiceError();
      }
      throw error;
    }
  }

  async recordExposures(childId: string, updates: ExposureUpdate[]): Promise<void> {
    for (const u of updates) {
      const existing = await this.txHost.tx.ingredientExposure.findUnique({
        where: { childId_ingredientId: { childId, ingredientId: u.ingredientId } },
      });
      if (!existing) {
        await this.txHost.tx.ingredientExposure.create({
          data: {
            childId,
            ingredientId: u.ingredientId,
            firstTriedAt: u.at,
            lastEatenAt: u.at,
            status: u.tried ? 'tried' : 'new',
          },
        });
        continue;
      }
      await this.txHost.tx.ingredientExposure.update({
        where: { childId_ingredientId: { childId, ingredientId: u.ingredientId } },
        data: {
          firstTriedAt:
            existing.firstTriedAt && existing.firstTriedAt <= u.at ? existing.firstTriedAt : u.at,
          lastEatenAt:
            existing.lastEatenAt && existing.lastEatenAt >= u.at ? existing.lastEatenAt : u.at,
          // A food once tried stays tried (BR-44).
          status: existing.status === 'tried' || u.tried ? 'tried' : existing.status,
        },
      });
    }
  }
}
