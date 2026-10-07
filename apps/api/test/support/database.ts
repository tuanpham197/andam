import { randomUUID } from 'node:crypto';
import type { Env } from '../../src/shared/infrastructure/config/env.js';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service.js';

export function createTestPrisma(): PrismaService {
  return new PrismaService({ DATABASE_URL: process.env.DATABASE_URL! } as Env);
}

/** Empties every application table so each test file starts from a clean database. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

export async function insertUser(prisma: PrismaService, email = `${randomUUID()}@test.vn`) {
  return prisma.user.create({ data: { id: randomUUID(), email, passwordHash: 'x' } });
}
