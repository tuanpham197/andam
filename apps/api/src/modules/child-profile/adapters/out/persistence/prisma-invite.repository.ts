import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { PrismaTransactionHost } from '../../../../../shared/infrastructure/persistence/transaction-host.js';
import type { InviteRepository } from '../../../application/ports/out/invite.repository.js';
import { ChildInvite } from '../../../domain/invite.js';

@Injectable()
export class PrismaInviteRepository implements InviteRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: PrismaTransactionHost) {}

  async add(invite: ChildInvite): Promise<void> {
    await this.txHost.tx.childInvite.create({
      data: {
        id: invite.id,
        childId: invite.childId,
        tokenHash: invite.tokenHash,
        createdBy: invite.createdBy,
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
      },
    });
  }

  async findByTokenHash(tokenHash: string): Promise<ChildInvite | null> {
    const row = await this.txHost.tx.childInvite.findUnique({ where: { tokenHash } });
    return row && ChildInvite.restore(row);
  }

  async find(childId: string, inviteId: string): Promise<ChildInvite | null> {
    const row = await this.txHost.tx.childInvite.findFirst({ where: { id: inviteId, childId } });
    return row && ChildInvite.restore(row);
  }

  async listPending(childId: string, now: Date): Promise<ChildInvite[]> {
    const rows = await this.txHost.tx.childInvite.findMany({
      where: { childId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ChildInvite.restore(row));
  }

  async markAccepted(invite: ChildInvite): Promise<boolean> {
    const { count } = await this.txHost.tx.childInvite.updateMany({
      where: { id: invite.id, acceptedAt: null, revokedAt: null },
      data: { acceptedBy: invite.acceptedBy, acceptedAt: invite.acceptedAt },
    });
    return count === 1;
  }

  async saveRevoked(invite: ChildInvite): Promise<void> {
    await this.txHost.tx.childInvite.update({
      where: { id: invite.id },
      data: { revokedAt: invite.revokedAt },
    });
  }

  async revokeAllBy(userId: string, now: Date): Promise<void> {
    await this.txHost.tx.childInvite.updateMany({
      where: { createdBy: userId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}
