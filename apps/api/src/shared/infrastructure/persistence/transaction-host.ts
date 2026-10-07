import type { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { PrismaService } from '../prisma/prisma.service.js';

/** `tx` is the current transaction client, or the plain client outside a unit of work. */
export type PrismaTransactionHost = TransactionHost<TransactionalAdapterPrisma<PrismaService>>;
