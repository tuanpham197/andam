import { PrismaDatabaseHealthAdapter } from '../../src/modules/health/adapters/out/persistence/prisma-database-health.adapter.js';
import type { Env } from '../../src/shared/infrastructure/config/env.js';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service.js';

function prismaFor(databaseUrl: string) {
  return new PrismaService({ DATABASE_URL: databaseUrl } as Env);
}

describe('PrismaDatabaseHealthAdapter', () => {
  it('pings a reachable database', async () => {
    const prisma = prismaFor(process.env.DATABASE_URL!);
    await expect(new PrismaDatabaseHealthAdapter(prisma).ping()).resolves.toBe(true);
    await prisma.onModuleDestroy();
  });

  it('TC-API-004 reports false when the database is unreachable', async () => {
    const prisma = prismaFor('postgresql://nobody:nothing@127.0.0.1:1/none');
    await expect(new PrismaDatabaseHealthAdapter(prisma).ping()).resolves.toBe(false);
    await prisma.onModuleDestroy();
  });
});
