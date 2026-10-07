import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { PrismaTransactionHost } from '../../../../../shared/infrastructure/persistence/transaction-host.js';
import { ID_GENERATOR, type IdGenerator } from '../../../../../shared/kernel/id-generator.port.js';
import type { LoginAttemptRepository } from '../../../application/ports/out/login-attempt.repository.js';
import type { LoginAttempt } from '../../../domain/login-throttle.js';

@Injectable()
export class PrismaLoginAttemptRepository implements LoginAttemptRepository {
  constructor(
    @Inject(TransactionHost) private readonly txHost: PrismaTransactionHost,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async record(email: string, attempt: LoginAttempt): Promise<void> {
    await this.txHost.tx.loginAttempt.create({
      data: { id: this.ids.next(), email, ...attempt },
    });
  }

  since(email: string, from: Date): Promise<LoginAttempt[]> {
    return this.txHost.tx.loginAttempt.findMany({
      where: { email, attemptedAt: { gte: from } },
      select: { succeeded: true, attemptedAt: true },
      orderBy: { attemptedAt: 'asc' },
    });
  }
}
