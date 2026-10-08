import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '../../../../../generated/prisma/client.js';
import type { PrismaTransactionHost } from '../../../../../shared/infrastructure/persistence/transaction-host.js';
import type {
  MemberView,
  MembershipRepository,
  NewMember,
} from '../../../application/ports/out/membership.repository.js';
import { AlreadyMemberError } from '../../../domain/errors.js';
import { displayName, type MemberRole } from '../../../domain/membership.js';

const activeUser = { deletedAt: null };

@Injectable()
export class PrismaMembershipRepository implements MembershipRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: PrismaTransactionHost) {}

  async roleOf(childId: string, userId: string): Promise<MemberRole | null> {
    const row = await this.txHost.tx.childMember.findUnique({
      where: { childId_userId: { childId, userId } },
      select: { role: true },
    });
    return row?.role ?? null;
  }

  async rolesOf(userId: string): Promise<Map<string, MemberRole>> {
    const rows = await this.txHost.tx.childMember.findMany({
      where: { userId },
      select: { childId: true, role: true },
    });
    return new Map(rows.map((r) => [r.childId, r.role]));
  }

  async list(childId: string): Promise<MemberView[]> {
    const rows = await this.txHost.tx.childMember.findMany({
      where: { childId, user: activeUser },
      include: { user: { select: { email: true, displayName: true } } },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });
    return rows.map((r) => ({
      userId: r.userId,
      displayName: displayName(r.user.displayName, r.user.email),
      email: r.user.email,
      role: r.role,
      joinedAt: r.joinedAt,
    }));
  }

  count(childId: string): Promise<number> {
    return this.txHost.tx.childMember.count({ where: { childId, user: activeUser } });
  }

  async add(member: NewMember): Promise<void> {
    try {
      await this.txHost.tx.childMember.create({ data: member });
    } catch (error) {
      // Same person twice is "already a member"; a second owner (partial index) is a bug, not that.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        !JSON.stringify(error.meta).includes('child_members_one_owner_key')
      ) {
        throw new AlreadyMemberError(member.childId);
      }
      throw error;
    }
  }

  async remove(childId: string, userId: string): Promise<boolean> {
    const { count } = await this.txHost.tx.childMember.deleteMany({
      where: { childId, userId, role: 'caregiver' },
    });
    return count === 1;
  }

  async transferOwnership(childId: string, from: string, to: string): Promise<void> {
    const tx = this.txHost.tx;
    // The old owner steps down first: the partial unique index allows one owner at a time.
    await tx.childMember.update({
      where: { childId_userId: { childId, userId: from } },
      data: { role: 'caregiver' },
    });
    await tx.childMember.update({
      where: { childId_userId: { childId, userId: to } },
      data: { role: 'owner' },
    });
    await tx.child.update({ where: { id: childId }, data: { userId: to } });
  }

  async displayNameOf(userId: string): Promise<string> {
    const user = await this.txHost.tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, displayName: true },
    });
    return displayName(user.displayName, user.email);
  }

  async ownedWithOthers(userId: string): Promise<{ id: string; name: string }[]> {
    return this.txHost.tx.child.findMany({
      where: {
        members: {
          some: { userId, role: 'owner' },
        },
        AND: { members: { some: { userId: { not: userId }, user: activeUser } } },
      },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async leaveAllAsCaregiver(userId: string): Promise<void> {
    await this.txHost.tx.childMember.deleteMany({ where: { userId, role: 'caregiver' } });
  }
}
