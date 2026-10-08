import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import { childrenOf } from '../../../../../shared/infrastructure/persistence/child-access.js';
import type { PrismaTransactionHost } from '../../../../../shared/infrastructure/persistence/transaction-host.js';
import type { ChildRepository } from '../../../application/ports/out/child.repository.js';
import { Child } from '../../../domain/child.js';

const include = { avoidAllergens: true, avoidIngredients: true } as const;
type ChildRow = Prisma.ChildGetPayload<{ include: typeof include }>;

// `date` columns come back as UTC midnight; the domain works with calendar dates.
const toDateColumn = (date: string) => new Date(`${date}T00:00:00.000Z`);
const fromDateColumn = (date: Date) => date.toISOString().slice(0, 10);

const toDomain = (row: ChildRow) =>
  Child.restore({
    id: row.id,
    userId: row.userId,
    name: row.name,
    birthDate: fromDateColumn(row.birthDate),
    isPremature: row.isPremature,
    weeksEarly: row.weeksEarly,
    stageOverride: row.stageOverride,
    priorReaction: row.priorReaction,
    priorReactionNote: row.priorReactionNote,
    avoidAllergens: row.avoidAllergens.map((a) => a.allergen),
    avoidIngredients: row.avoidIngredients.map((i) => ({
      ingredientId: i.ingredientId,
      reason: i.reason,
    })),
    createdAt: row.createdAt,
  });

const scalars = (child: Child) => ({
  name: child.name,
  birthDate: toDateColumn(child.birthDate),
  isPremature: child.isPremature,
  weeksEarly: child.weeksEarly,
  stageOverride: child.stageOverride,
  priorReaction: child.priorReaction,
  priorReactionNote: child.priorReactionNote,
});

@Injectable()
export class PrismaChildRepository implements ChildRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: PrismaTransactionHost) {}

  async create(child: Child): Promise<void> {
    await this.txHost.tx.child.create({
      data: {
        id: child.id,
        userId: child.userId,
        createdAt: child.createdAt,
        ...scalars(child),
        avoidAllergens: { create: child.avoidAllergens.map((allergen) => ({ allergen })) },
        avoidIngredients: { create: child.avoidIngredients },
        // BR-70: the creator owns the child.
        members: {
          create: { userId: child.userId, role: 'owner', joinedAt: child.createdAt },
        },
      },
    });
  }

  async findById(childId: string): Promise<Child | null> {
    const row = await this.txHost.tx.child.findUnique({ where: { id: childId }, include });
    return row ? toDomain(row) : null;
  }

  async findOwned(childId: string, userId: string): Promise<Child | null> {
    const row = await this.txHost.tx.child.findFirst({
      where: { id: childId, ...childrenOf(userId) },
      include,
    });
    return row ? toDomain(row) : null;
  }

  async listOwned(userId: string): Promise<Child[]> {
    const rows = await this.txHost.tx.child.findMany({
      where: childrenOf(userId),
      include,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDomain);
  }

  async save(child: Child): Promise<void> {
    // Joins the caller's unit of work when there is one, otherwise runs atomically on its own.
    await this.txHost.withTransaction(async () => {
      const tx = this.txHost.tx;
      await tx.child.update({ where: { id: child.id }, data: scalars(child) });
      await tx.childAvoidAllergen.deleteMany({ where: { childId: child.id } });
      await tx.childAvoidIngredient.deleteMany({ where: { childId: child.id } });
      await tx.childAvoidAllergen.createMany({
        data: child.avoidAllergens.map((allergen) => ({ childId: child.id, allergen })),
      });
      await tx.childAvoidIngredient.createMany({
        data: child.avoidIngredients.map((i) => ({ childId: child.id, ...i })),
      });
    });
  }

  async deleteOwned(childId: string, userId: string): Promise<boolean> {
    const { count } = await this.txHost.tx.child.deleteMany({
      where: { id: childId, ...childrenOf(userId) },
    });
    return count === 1;
  }
}
