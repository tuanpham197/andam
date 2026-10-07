import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { UnitOfWork } from '../../kernel/unit-of-work.port.js';
import type { PrismaTransactionHost } from './transaction-host.js';

@Injectable()
export class ClsUnitOfWork implements UnitOfWork {
  constructor(@Inject(TransactionHost) private readonly txHost: PrismaTransactionHost) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.txHost.withTransaction(work);
  }
}
