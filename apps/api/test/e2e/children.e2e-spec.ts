import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  REPO_CATALOG_DIR,
  loadCatalog,
} from '../../src/modules/catalog/adapters/out/files/catalog-files.js';
import { seedCatalog } from '../../src/modules/catalog/adapters/out/persistence/catalog-seeder.js';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service.js';
import { CLOCK } from '../../src/shared/kernel/clock.port.js';
import { FixedClock } from '../fakes/kernel.js';
import { createTestApp } from '../support/app.js';
import { signUp } from '../support/auth.js';
import { resetDatabase } from '../support/database.js';

// 09:00 on 24/09/2026 in Vietnam: the date shown in the design.
const clock = new FixedClock(new Date('2026-09-24T02:00:00Z'));
let app: INestApplication;
let owner: string;
let stranger: string;

const NA = {
  name: 'Na',
  birthDate: '2026-01-12',
  isPremature: false,
  priorReaction: 'never',
  avoidAllergens: ['egg'],
  avoidIngredients: [{ ingredientId: 'ing_muop_dang', reason: 'dislike' }],
};

beforeAll(async () => {
  app = await createTestApp({ overrides: [[CLOCK, clock]] });
  const prisma = app.get(PrismaService);
  await resetDatabase(prisma);
  await seedCatalog(prisma, await loadCatalog(REPO_CATALOG_DIR));
});
beforeEach(async () => {
  clock.set('2026-09-24T02:00:00Z');
  ({ authorization: owner } = await signUp(app));
  ({ authorization: stranger } = await signUp(app));
});
afterAll(() => app.close());

const http = () => request(app.getHttpServer());
const create = (body: Record<string, unknown> = {}, auth = owner) =>
  http()
    .post('/api/v1/children')
    .set('Authorization', auth)
    .send({ ...NA, ...body });

describe('POST /api/v1/children', () => {
  it('TC-CHD-001 creates bé Na with age, stage and resolved ingredient names', async () => {
    const res = await create().expect(201);
    expect(res.body).toMatchObject({
      name: 'Na',
      initials: 'Na',
      birthDate: '2026-01-12',
      age: { months: 8, days: 12, corrected: false },
      autoStage: 2,
      effectiveStage: 2,
      plannable: true,
      avoidAllergens: ['egg'],
      avoidIngredients: [{ ingredientId: 'ing_muop_dang', name: 'Mướp đắng', reason: 'dislike' }],
      stages: [
        { id: 1, state: 'open', unlockAtMonths: 6 },
        { id: 2, state: 'selected', unlockAtMonths: 8 },
        { id: 3, state: 'locked', unlockAtMonths: 10 },
        { id: 4, state: 'locked', unlockAtMonths: 12 },
      ],
    });
  });

  it('TC-AGE-002 uses the corrected age for a premature baby', async () => {
    const res = await create({ isPremature: true, weeksEarly: 3 }).expect(201);
    expect(res.body).toMatchObject({ age: { months: 7, days: 22, corrected: true }, autoStage: 1 });
  });

  it('TC-CHD-016 accepts a baby under 6 months without planning menus', async () => {
    const res = await create({ birthDate: '2026-05-01' }).expect(201);
    expect(res.body).toMatchObject({
      plannable: false,
      notPlannableReason: 'too_young',
      effectiveStage: null,
    });
  });

  it.each([
    ['empty name', { name: '   ' }, 400, 'INVALID_CHILD_NAME'],
    ['31-character name', { name: 'a'.repeat(31) }, 400, 'INVALID_CHILD_NAME'],
    ['impossible date', { birthDate: '2026-02-30' }, 400, 'INVALID_BIRTH_DATE'],
    ['TC-AGE-011 future birth', { birthDate: '2026-09-25' }, 400, 'INVALID_BIRTH_DATE'],
    [
      'TC-AGE-014 premature with 0 weeks',
      { isPremature: true, weeksEarly: 0 },
      400,
      'INVALID_WEEKS_EARLY',
    ],
    [
      'TC-AGE-014 premature with 17 weeks',
      { isPremature: true, weeksEarly: 17 },
      400,
      'INVALID_WEEKS_EARLY',
    ],
    ['TC-AGE-007 older than 24 months', { birthDate: '2024-09-01' }, 422, 'CHILD_TOO_OLD'],
    [
      'TC-CHD-008 unknown ingredient',
      { avoidIngredients: [{ ingredientId: 'ing_khong_co', reason: 'dislike' }] },
      422,
      'UNKNOWN_INGREDIENT',
    ],
    ['TC-CHD-007 unknown allergen', { avoidAllergens: ['milk'] }, 400, 'VALIDATION_FAILED'],
    ['wrong date format', { birthDate: '12/01/2026' }, 400, 'VALIDATION_FAILED'],
    ['weeksEarly not a number', { isPremature: true, weeksEarly: 'ba' }, 400, 'VALIDATION_FAILED'],
    [
      'unknown avoid reason',
      { avoidIngredients: [{ ingredientId: 'ing_tom', reason: 'hate' }] },
      400,
      'VALIDATION_FAILED',
    ],
    ['missing name', { name: undefined }, 400, 'VALIDATION_FAILED'],
    ['unknown field', { isAdmin: true }, 400, 'VALIDATION_FAILED'],
  ])('rejects %s', async (_label, body, status, code) => {
    const res = await create(body).expect(status);
    expect(res.body).toMatchObject({ code });
  });

  it('TC-CHD-011 refuses more than 100 ingredients to avoid', async () => {
    const res = await create({
      avoidIngredients: Array.from({ length: 101 }, (_, i) => ({
        ingredientId: `ing_${i}`,
        reason: 'dislike',
      })),
    }).expect(400);
    expect(res.body).toMatchObject({ code: 'TOO_MANY_AVOID_ITEMS' });
  });

  it('requires authentication', async () => {
    await http().post('/api/v1/children').send(NA).expect(401);
  });
});

describe('reading children', () => {
  it('lists only my children', async () => {
    await create();
    await create({ name: 'Khác' }, stranger);
    const res = await http().get('/api/v1/children').set('Authorization', owner).expect(200);
    expect(res.body.map((c: { name: string }) => c.name)).toEqual(['Na']);
  });

  it('TC-CHD-013 answers 404 for another user’s child', async () => {
    const { body } = await create({}, stranger);
    const res = await http()
      .get(`/api/v1/children/${body.id}`)
      .set('Authorization', owner)
      .expect(404);
    expect(res.body).toMatchObject({ code: 'CHILD_NOT_FOUND' });
  });

  it('TC-CHD-014 answers 400 for an id that is not a UUID', async () => {
    await http().get('/api/v1/children/not-a-uuid').set('Authorization', owner).expect(400);
  });

  it('reads my child', async () => {
    const { body } = await create();
    const res = await http()
      .get(`/api/v1/children/${body.id}`)
      .set('Authorization', owner)
      .expect(200);
    expect(res.body.id).toBe(body.id);
  });
});

describe('PATCH /api/v1/children/:id', () => {
  it('TC-STG-001 keeps a lower stage and clears it with null', async () => {
    const { body } = await create();
    const patch = (b: Record<string, unknown>) =>
      http().patch(`/api/v1/children/${body.id}`).set('Authorization', owner).send(b);

    expect((await patch({ stageOverride: 1 }).expect(200)).body).toMatchObject({
      effectiveStage: 1,
      isOverride: true,
    });
    expect((await patch({ name: 'Na Na' }).expect(200)).body).toMatchObject({
      name: 'Na Na',
      isOverride: true,
    });
    expect((await patch({ stageOverride: null }).expect(200)).body).toMatchObject({
      effectiveStage: 2,
      isOverride: false,
    });
  });

  it('TC-STG-002 refuses a stage above the age', async () => {
    const { body } = await create();
    const res = await http()
      .patch(`/api/v1/children/${body.id}`)
      .set('Authorization', owner)
      .send({ stageOverride: 3 })
      .expect(422);
    expect(res.body).toMatchObject({ code: 'STAGE_ABOVE_AGE' });
  });

  it.each([0, 5, 1.5, '2'])('TC-STG-004 refuses stageOverride %j', async (stageOverride) => {
    const { body } = await create();
    await http()
      .patch(`/api/v1/children/${body.id}`)
      .set('Authorization', owner)
      .send({ stageOverride })
      .expect(400);
  });

  it('changes the birth information', async () => {
    const { body } = await create();
    const res = await http()
      .patch(`/api/v1/children/${body.id}`)
      .set('Authorization', owner)
      .send({ isPremature: true, weeksEarly: 3 })
      .expect(200);
    expect(res.body).toMatchObject({ age: { months: 7, days: 22, corrected: true } });
  });

  it('refuses another user’s child', async () => {
    const { body } = await create({}, stranger);
    await http()
      .patch(`/api/v1/children/${body.id}`)
      .set('Authorization', owner)
      .send({ name: 'x' })
      .expect(404);
  });
});

describe('PUT /api/v1/children/:id/avoid-list', () => {
  it('replaces both lists', async () => {
    const { body } = await create();
    const res = await http()
      .put(`/api/v1/children/${body.id}/avoid-list`)
      .set('Authorization', owner)
      .send({
        allergens: ['fish', 'fish'],
        ingredients: [{ ingredientId: 'ing_tom', reason: 'not_eat' }],
      })
      .expect(200);
    expect(res.body.avoidAllergens).toEqual(['fish']);
    expect(res.body.avoidIngredients).toEqual([
      { ingredientId: 'ing_tom', name: 'Tôm', reason: 'not_eat' },
    ]);
  });

  it('refuses unknown ingredients', async () => {
    const { body } = await create();
    await http()
      .put(`/api/v1/children/${body.id}/avoid-list`)
      .set('Authorization', owner)
      .send({ allergens: [], ingredients: [{ ingredientId: 'ing_x', reason: 'dislike' }] })
      .expect(422);
  });
});

describe('GET /api/v1/children/:id/stage-preview', () => {
  it('previews premature birth and a chosen stage without saving', async () => {
    const { body } = await create();
    const res = await http()
      .get(`/api/v1/children/${body.id}/stage-preview?isPremature=true&weeksEarly=3`)
      .set('Authorization', owner)
      .expect(200);
    expect(res.body).toMatchObject({ age: { months: 7, days: 22, corrected: true }, autoStage: 1 });

    const stage = await http()
      .get(`/api/v1/children/${body.id}/stage-preview?stage=1`)
      .set('Authorization', owner)
      .expect(200);
    expect(stage.body).toMatchObject({ effectiveStage: 1, isOverride: true });

    const saved = await http().get(`/api/v1/children/${body.id}`).set('Authorization', owner);
    expect(saved.body).toMatchObject({ isPremature: false, isOverride: false });
  });

  it('previews turning premature birth off for a premature baby', async () => {
    const { body } = await create({ isPremature: true, weeksEarly: 3 });
    const res = await http()
      .get(`/api/v1/children/${body.id}/stage-preview?birthDate=2026-01-12&isPremature=false`)
      .set('Authorization', owner)
      .expect(200);
    expect(res.body).toMatchObject({
      age: { months: 8, days: 12, corrected: false },
      autoStage: 2,
    });
  });

  it.each(['isPremature=maybe', 'weeksEarly=abc', 'stage=9'])('rejects %s', async (query) => {
    const { body } = await create();
    await http()
      .get(`/api/v1/children/${body.id}/stage-preview?${query}`)
      .set('Authorization', owner)
      .expect(400);
  });
});

describe('DELETE /api/v1/children/:id (NFR-019)', () => {
  it('deletes my child, then it is gone', async () => {
    const { body } = await create();
    await http().delete(`/api/v1/children/${body.id}`).set('Authorization', owner).expect(204);
    await http().get(`/api/v1/children/${body.id}`).set('Authorization', owner).expect(404);
  });

  it('cannot delete another user’s child', async () => {
    const { body } = await create({}, stranger);
    await http().delete(`/api/v1/children/${body.id}`).set('Authorization', owner).expect(404);
    await http().get(`/api/v1/children/${body.id}`).set('Authorization', stranger).expect(200);
  });
});
