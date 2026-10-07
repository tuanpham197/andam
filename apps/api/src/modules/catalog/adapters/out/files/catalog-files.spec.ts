import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateCatalog } from '../../../domain/catalog-validation.js';
import { REPO_CATALOG_DIR, loadCatalog } from './catalog-files.js';

describe('loadCatalog', () => {
  it('reads stages, ingredients and dishes from a directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'catalog-'));
    await writeFile(join(dir, 'stages.json'), '[{"id":1}]');
    await writeFile(join(dir, 'ingredients.json'), '[]');
    await writeFile(join(dir, 'dishes.json'), '[]');
    await expect(loadCatalog(dir)).resolves.toEqual({
      stages: [{ id: 1 }],
      ingredients: [],
      dishes: [],
    });
  });

  it('fails clearly when a file is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'catalog-'));
    await expect(loadCatalog(dir)).rejects.toThrow(/stages\.json/);
  });

  it('fails clearly on invalid JSON', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'catalog-'));
    await writeFile(join(dir, 'stages.json'), '[');
    await writeFile(join(dir, 'ingredients.json'), '[]');
    await writeFile(join(dir, 'dishes.json'), '[]');
    await expect(loadCatalog(dir)).rejects.toThrow(/stages\.json/);
  });
});

describe('the catalog committed in the repository', () => {
  it('passes every validation rule (TC-DB-004)', async () => {
    const catalog = await loadCatalog(REPO_CATALOG_DIR);
    expect(validateCatalog(catalog)).toEqual([]);
    expect(catalog.stages).toHaveLength(4);
    expect(catalog.dishes.length).toBeGreaterThanOrEqual(12);
  });

  it('is not yet publishable: dishes wait for nutritionist review (C-008)', async () => {
    const catalog = await loadCatalog(REPO_CATALOG_DIR);
    expect(validateCatalog(catalog, { production: true }).length).toBeGreaterThan(0);
  });
});
