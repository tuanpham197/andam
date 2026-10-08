import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { childrenOf } from '../../../../../shared/infrastructure/persistence/child-access.js';
import type { PrismaTransactionHost } from '../../../../../shared/infrastructure/persistence/transaction-host.js';
import { displayName } from '../../../../child-profile/domain/membership.js';
import type {
  JournalCursor,
  JournalDish,
  JournalEntry,
  JournalReader,
} from '../../../application/ports/out/journal.reader.js';

const day = (date: Date) => date.toISOString().slice(0, 10);

const olderThan = (column: string, before: JournalCursor | null) =>
  before
    ? {
        OR: [{ [column]: { lt: before.at } }, { [column]: before.at, id: { lt: before.id } }],
      }
    : {};

const pausedNames = (rows: { ingredientId: string; ingredient: { name: string } }[]) =>
  rows.map((r) => ({ id: r.ingredientId, name: r.ingredient.name }));

const pausedInclude = { include: { ingredient: { select: { name: true } } } } as const;
const actorSelect = { select: { displayName: true, email: true } } as const;
const nameOf = (actor: { displayName: string | null; email: string } | null) =>
  actor && displayName(actor.displayName, actor.email);

/** Read model over logs, reactions, urgent events and the pauses they caused (G02). */
@Injectable()
export class PrismaJournalReader implements JournalReader {
  constructor(@Inject(TransactionHost) private readonly txHost: PrismaTransactionHost) {}

  async ownsChild(userId: string, childId: string): Promise<boolean> {
    return (
      (await this.txHost.tx.child.count({ where: { id: childId, ...childrenOf(userId) } })) > 0
    );
  }

  async page(
    childId: string,
    before: JournalCursor | null,
    limit: number,
  ): Promise<JournalEntry[]> {
    const order = (column: string) => [{ [column]: 'desc' as const }, { id: 'desc' as const }];
    const [logs, urgents] = await Promise.all([
      this.txHost.tx.mealLog.findMany({
        where: { childId, ...olderThan('loggedAt', before) },
        orderBy: order('loggedAt'),
        take: limit,
        include: {
          reaction: true,
          meal: { select: { date: true, slot: true } },
          paused: pausedInclude,
          actor: actorSelect,
        },
      }),
      this.txHost.tx.urgentEvent.findMany({
        where: { childId, ...olderThan('openedAt', before) },
        orderBy: order('openedAt'),
        take: limit,
        include: {
          meal: { select: { date: true, slot: true, dishId: true } },
          paused: pausedInclude,
          actor: actorSelect,
        },
      }),
    ]);
    const dishIds = [
      ...new Set([...logs.map((l) => l.dishId), ...urgents.flatMap((u) => u.meal?.dishId ?? [])]),
    ];
    const dishes = new Map<string, JournalDish>(
      (
        await this.txHost.tx.dish.findMany({
          where: { id: { in: dishIds } },
          select: { id: true, name: true, ownerChildId: true },
        })
      ).map((d) => [d.id, { id: d.id, name: d.name, custom: d.ownerChildId !== null }]),
    );

    const entries: JournalEntry[] = [
      ...logs.map((log): JournalEntry => ({
        kind: 'meal',
        id: log.id,
        at: log.loggedAt,
        date: day(log.meal.date),
        slot: log.meal.slot,
        dish: dishes.get(log.dishId)!,
        amount: log.amount,
        liking: log.liking,
        reaction: log.reaction && {
          symptoms: log.reaction.symptoms,
          severity: log.reaction.severity,
          note: log.reaction.note,
        },
        pausedIngredients: pausedNames(log.paused),
        actorName: nameOf(log.actor),
      })),
      ...urgents.map((event): JournalEntry => ({
        kind: 'urgent',
        id: event.id,
        at: event.openedAt,
        meal: event.meal && {
          date: day(event.meal.date),
          slot: event.meal.slot,
          dish: dishes.get(event.meal.dishId)!,
        },
        contactedMedicalAt: event.contactedMedicalAt,
        pausedIngredients: pausedNames(event.paused),
        actorName: nameOf(event.actor),
      })),
    ];
    return entries
      .sort((a, b) => b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : -1))
      .slice(0, limit);
  }
}
