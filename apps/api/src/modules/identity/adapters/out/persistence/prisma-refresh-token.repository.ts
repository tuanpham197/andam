import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { PrismaTransactionHost } from '../../../../../shared/infrastructure/persistence/transaction-host.js';
import type { RefreshTokenRepository } from '../../../application/ports/out/refresh-token.repository.js';
import { RefreshToken } from '../../../domain/refresh-token.js';

@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: PrismaTransactionHost) {}

  async create(token: RefreshToken): Promise<void> {
    await this.txHost.tx.refreshToken.create({
      data: {
        id: token.id,
        userId: token.userId,
        familyId: token.familyId,
        tokenHash: token.tokenHash,
        userAgent: token.userAgent,
        expiresAt: token.expiresAt,
        revokedAt: token.revokedAt,
        rotatedAt: token.rotatedAt,
      },
    });
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    const row = await this.txHost.tx.refreshToken.findUnique({ where: { tokenHash } });
    return row
      ? RefreshToken.restore({
          id: row.id,
          userId: row.userId,
          familyId: row.familyId,
          tokenHash: row.tokenHash,
          userAgent: row.userAgent,
          expiresAt: row.expiresAt,
          revokedAt: row.revokedAt,
          rotatedAt: row.rotatedAt,
        })
      : null;
  }

  async save(token: RefreshToken): Promise<void> {
    await this.txHost.tx.refreshToken.update({
      where: { id: token.id },
      data: { revokedAt: token.revokedAt },
    });
  }

  async rotateIfActive(id: string, now: Date): Promise<boolean> {
    const { count } = await this.txHost.tx.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: now, rotatedAt: now },
    });
    return count === 1;
  }

  async familyHasActiveToken(familyId: string, now: Date): Promise<boolean> {
    const live = await this.txHost.tx.refreshToken.count({
      where: { familyId, revokedAt: null, expiresAt: { gte: now } },
    });
    return live > 0;
  }

  async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.txHost.tx.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  async revokeAllForUser(userId: string, now: Date): Promise<void> {
    await this.txHost.tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}
