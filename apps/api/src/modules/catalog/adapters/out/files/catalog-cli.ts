import type { PrismaService } from '../../../../../shared/infrastructure/prisma/prisma.service.js';
import { validateCatalog } from '../../../domain/catalog-validation.js';
import { seedCatalog } from '../persistence/catalog-seeder.js';
import { REPO_CATALOG_DIR, loadCatalog } from './catalog-files.js';

interface Options {
  /** Production refuses draft (unreviewed) dishes. */
  production: boolean;
}

export async function checkRepositoryCatalog(options: Options): Promise<string[]> {
  return validateCatalog(await loadCatalog(REPO_CATALOG_DIR), options);
}

export async function seedRepositoryCatalog(
  prisma: PrismaService,
  options: Options,
): Promise<void> {
  const catalog = await loadCatalog(REPO_CATALOG_DIR);
  const problems = validateCatalog(catalog, options);
  if (problems.length > 0) {
    throw new Error(`Catalog is invalid:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
  await seedCatalog(prisma, catalog);
}
