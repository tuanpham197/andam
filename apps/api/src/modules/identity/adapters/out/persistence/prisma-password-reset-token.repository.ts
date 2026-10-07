import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { PrismaTransactionHost } from '../../../../../shared/infrastructure/persistence/transaction-host.js';
import type { PasswordResetTokenRepository } from '../../../application/ports/out/password-reset-token.repository.js';
import { PasswordResetToken } from '../../../domain/password-reset-token.js';

@Injectable()
export class PrismaPasswordResetTokenRepository implements PasswordResetTokenRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: PrismaTransactionHost) {}

  async create(token: PasswordResetToken): Promise<void> {
    await this.txHost.tx.passwordResetToken.create({
      data: {
        id: token.id,
        userId: token.userId,
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt,
        usedAt: token.usedAt,
      },
    });
  }

  async findByHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const row = await this.txHost.tx.passwordResetToken.findUnique({ where: { tokenHash } });
    return row
      ? PasswordResetToken.restore({
          id: row.id,
          userId: row.userId,
          tokenHash: row.tokenHash,
          expiresAt: row.expiresAt,
          usedAt: row.usedAt,
        })
      : null;
  }

  async save(token: PasswordResetToken): Promise<void> {
    await this.txHost.tx.passwordResetToken.update({
      where: { id: token.id },
      data: { usedAt: token.usedAt },
    });
  }
}
