import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  REPO_CATALOG_DIR,
  loadCatalog,
} from '../../src/modules/catalog/adapters/out/files/catalog-files.js';
import { seedCatalog } from '../../src/modules/catalog/adapters/out/persistence/catalog-seeder.js';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service.js';
import { createTestApp } from '../support/app.js';
import { signUp } from '../support/auth.js';
import { resetDatabase } from '../support/database.js';

let app: INestApplication;
let authorization: string;

beforeAll(async () => {
  app = await createTestApp();
  const prisma = app.get(PrismaService);
  await resetDatabase(prisma);
  await seedCatalog(prisma, await loadCatalog(REPO_CATALOG_DIR));
  ({ authorization } = await signUp(app));
});
afterAll(() => app.close());

const get = (path: string) =>
  request(app.getHttpServer()).get(path).set('Authorization', authorization);

describe('GET /api/v1/stages', () => {
  it('lists the 4 stages', async () => {
    const res = await get('/api/v1/stages').expect(200);
    expect(res.body.map((s: { name: string }) => s.name)).toEqual([
      'Giai đoạn 1',
      'Giai đoạn 2',
      'Giai đoạn 3',
      'Giai đoạn 4',
    ]);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/api/v1/stages').expect(401);
  });
});

describe('GET /api/v1/ingredients', () => {
  it('TC-ING-001 searches without accents', async () => {
    const res = await get('/api/v1/ingredients?q=ca%20rot').expect(200);
    expect(res.body[0]).toEqual({
      id: 'ing_ca_rot',
      name: 'Cà rốt',
      foodGroup: 'veg',
      proteinSource: null,
      allergenTags: [],
    });
  });

  it('accepts Vietnamese in the query string', async () => {
    const res = await get(`/api/v1/ingredients?q=${encodeURIComponent('mướp đắng')}`).expect(200);
    expect(res.body[0].name).toBe('Mướp đắng');
  });

  it.each([
    ['missing q', '/api/v1/ingredients', 'VALIDATION_FAILED'],
    ['blank q', '/api/v1/ingredients?q=%20%20', 'INVALID_SEARCH_QUERY'],
    ['q over 100 chars', `/api/v1/ingredients?q=${'a'.repeat(101)}`, 'INVALID_SEARCH_QUERY'],
    ['q repeated (array)', '/api/v1/ingredients?q=a&q=b', 'VALIDATION_FAILED'],
  ])('TC-ING-003 answers 400 for %s', async (_label, path, code) => {
    const res = await get(path).expect(400);
    expect(res.body).toMatchObject({ code });
  });

  it('TC-ING-004 treats % as text', async () => {
    const res = await get('/api/v1/ingredients?q=%25').expect(200);
    expect(res.body.length).toBeLessThan(10);
  });

  it('TC-ING-005 returns at most 20 results', async () => {
    const res = await get('/api/v1/ingredients?q=a').expect(200);
    expect(res.body.length).toBeLessThanOrEqual(20);
  });
});
