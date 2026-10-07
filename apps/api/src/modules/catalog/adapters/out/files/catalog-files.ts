import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CatalogInput } from '../../../domain/catalog-validation.js';

/** `catalog/` at the repository root; src/ and dist/ share the same depth (8 levels up). */
export const REPO_CATALOG_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../../../..',
  'catalog',
);

async function readJson(dir: string, file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(join(dir, file), 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read catalog file ${file}: ${(error as Error).message}`, {
      cause: error,
    });
  }
}

/** Reads the three catalog files; shape checks happen in validateCatalog. */
export async function loadCatalog(dir: string): Promise<CatalogInput> {
  const [stages, ingredients, dishes] = await Promise.all([
    readJson(dir, 'stages.json'),
    readJson(dir, 'ingredients.json'),
    readJson(dir, 'dishes.json'),
  ]);
  return { stages, ingredients, dishes } as CatalogInput;
}
