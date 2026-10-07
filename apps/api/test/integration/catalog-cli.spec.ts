import {
  checkRepositoryCatalog,
  seedRepositoryCatalog,
} from '../../src/modules/catalog/adapters/out/files/catalog-cli.js';
import { createTestPrisma, resetDatabase } from '../support/database.js';

const prisma = createTestPrisma();
beforeEach(() => resetDatabase(prisma));
afterAll(() => prisma.onModuleDestroy());

describe('catalog CLI helpers', () => {
  it('checkRepositoryCatalog reports no problem outside production', async () => {
    await expect(checkRepositoryCatalog({ production: false })).resolves.toEqual([]);
  });

  it('checkRepositoryCatalog refuses draft dishes for production (C-008)', async () => {
    const problems = await checkRepositoryCatalog({ production: true });
    expect(problems.some((p) => p.includes('draft'))).toBe(true);
  });

  it('seedRepositoryCatalog seeds a valid catalog', async () => {
    await seedRepositoryCatalog(prisma, { production: false });
    expect(await prisma.stage.count()).toBe(4);
  });

  it('seedRepositoryCatalog refuses to seed an invalid catalog and writes nothing', async () => {
    await expect(seedRepositoryCatalog(prisma, { production: true })).rejects.toThrow(
      /Catalog is invalid:[\s\S]*draft/,
    );
    expect(await prisma.stage.count()).toBe(0);
  });
});
