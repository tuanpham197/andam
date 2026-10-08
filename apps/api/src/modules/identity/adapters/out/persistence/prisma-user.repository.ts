import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '../../../../../generated/prisma/client.js';
import type { PrismaTransactionHost } from '../../../../../shared/infrastructure/persistence/transaction-host.js';
import type {
  ConsentRecord,
  UserRepository,
} from '../../../application/ports/out/user.repository.js';
import type { Email } from '../../../domain/email.js';
import { EmailTakenError } from '../../../domain/errors.js';
import { User } from '../../../domain/user.js';

type UserRow = Prisma.UserGetPayload<object>;

const toDomain = (row: UserRow) =>
  User.restore({
    id: row.id,
    email: row.email as Email,
    passwordHash: row.passwordHash,
    timezone: row.timezone,
    displayName: row.displayName,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
  });

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: PrismaTransactionHost) {}

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.txHost.tx.user.findFirst({ where: { email } });
    return row ? toDomain(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.txHost.tx.user.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async create(user: User, consent: ConsentRecord): Promise<void> {
    try {
      await this.txHost.tx.user.create({
        data: {
          id: user.id,
          email: user.email,
          passwordHash: user.passwordHash,
          timezone: user.timezone,
          createdAt: user.createdAt,
          consents: { create: consent },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new EmailTakenError();
      }
      throw error;
    }
  }

  async save(user: User): Promise<void> {
    await this.txHost.tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash: user.passwordHash,
        displayName: user.displayName,
        deletedAt: user.deletedAt,
      },
    });
  }

  async purgeDeletedBefore(cutoff: Date): Promise<number> {
    // Foreign keys do the rest: children, sessions and consents cascade; actor columns null out.
    const { count } = await this.txHost.tx.user.deleteMany({
      where: { deletedAt: { lt: cutoff } },
    });
    return count;
  }
}
