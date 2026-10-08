import type { INestApplication } from '@nestjs/common';
import { readFileSync } from 'node:fs';
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

// 12:00 on 24/09/2026 in Vietnam.
const NOON = '2026-09-24T05:00:00Z';
const TODAY = '2026-09-24';
const clock = new FixedClock(new Date(NOON));
let app: INestApplication;
let prisma: PrismaService;

const api = () => request(app.getHttpServer());

interface Person {
  authorization: string;
  userId: string;
}

interface Family {
  mom: Person;
  dad: Person;
  stranger: Person;
  childId: string;
  lunchId: string;
  swapTarget: string;
  customDishId: string;
  inviteId: string;
  eventId: string;
  pausedId: string;
}

// Staples only: never "first tries" nor allergens, so the urgent event of the setup never pauses them.
const dish = (name = 'Cháo gạo yến mạch') => ({
  name,
  mealType: 'main',
  ingredients: [{ id: 'ing_gao_te' }, { id: 'ing_yen_mach' }],
  prepMin: 5,
  cookMin: 20,
  steps: [],
});

async function invite(owner: Person, childId: string) {
  const res = await api()
    .post(`/api/v1/children/${childId}/invites`)
    .set('Authorization', owner.authorization)
    .expect(201);
  return { id: res.body.id as string, token: (res.body.url as string).split('/invite/')[1]! };
}

/** Mom owns bé Na; dad joined through an invite; a stranger has an account of their own. */
async function family(): Promise<Family> {
  const [mom, dad, stranger] = [await signUp(app), await signUp(app), await signUp(app)];
  const child = await api()
    .post('/api/v1/children')
    .set('Authorization', mom.authorization)
    .send({
      name: 'Na',
      birthDate: '2026-01-12',
      isPremature: false,
      priorReaction: 'never',
      avoidAllergens: [],
      avoidIngredients: [],
    })
    .expect(201);
  const childId = child.body.id as string;
  const link = await invite(mom, childId);
  await api()
    .post(`/api/v1/invites/${link.token}/accept`)
    .set('Authorization', dad.authorization)
    .expect(200);
  const day = await api()
    .get(`/api/v1/children/${childId}/days/${TODAY}`)
    .set('Authorization', mom.authorization)
    .expect(200);
  const lunchId = day.body.meals.find((m: { slot: string }) => m.slot === 'lunch').id as string;
  const custom = await api()
    .post(`/api/v1/children/${childId}/custom-dishes`)
    .set('Authorization', mom.authorization)
    .send(dish())
    .expect(201);
  const pending = await invite(mom, childId);
  const event = await api()
    .post(`/api/v1/children/${childId}/urgent-events`)
    .set('Authorization', mom.authorization)
    .send({ mealId: lunchId })
    .expect(201);
  // After the urgent event: its paused foods are no longer suggested (BR-41).
  const suggestions = await api()
    .get(`/api/v1/meals/${lunchId}/swap-suggestions?reason=other`)
    .set('Authorization', mom.authorization)
    .expect(200);
  return {
    mom,
    dad,
    stranger,
    childId,
    lunchId,
    swapTarget: suggestions.body.ranked[0].dish.id,
    customDishId: custom.body.id,
    inviteId: pending.id,
    eventId: event.body.id,
    pausedId: event.body.pausedIngredients[0].id,
  };
}

beforeAll(async () => {
  app = await createTestApp({ overrides: [[CLOCK, clock]] });
  prisma = app.get(PrismaService);
  await resetDatabase(prisma);
  await seedCatalog(prisma, await loadCatalog(REPO_CATALOG_DIR));
});
beforeEach(() => clock.set(NOON));
afterAll(() => app.close());

type Call = (f: Family) => {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  url: string;
  body?: object;
};

/**
 * BR-73, route by route: [route as in openapi.json, the request, owner status, caregiver status].
 * A stranger always gets 404 (BR-74).
 */
const MATRIX: [string, Call, number, number][] = [
  [
    'GET /api/v1/children/{childId}',
    (f) => ({ method: 'get', url: `/api/v1/children/${f.childId}` }),
    200,
    200,
  ],
  [
    'PATCH /api/v1/children/{childId}',
    (f) => ({ method: 'patch', url: `/api/v1/children/${f.childId}`, body: { name: 'Bin' } }),
    200,
    403,
  ],
  [
    'DELETE /api/v1/children/{childId}',
    (f) => ({ method: 'delete', url: `/api/v1/children/${f.childId}` }),
    204,
    403,
  ],
  [
    'PUT /api/v1/children/{childId}/avoid-list',
    (f) => ({
      method: 'put',
      url: `/api/v1/children/${f.childId}/avoid-list`,
      body: { allergens: ['egg'], ingredients: [] },
    }),
    200,
    403,
  ],
  [
    'GET /api/v1/children/{childId}/stage-preview',
    (f) => ({ method: 'get', url: `/api/v1/children/${f.childId}/stage-preview` }),
    200,
    200,
  ],
  [
    'GET /api/v1/children/{childId}/members',
    (f) => ({ method: 'get', url: `/api/v1/children/${f.childId}/members` }),
    200,
    200,
  ],
  [
    'POST /api/v1/children/{childId}/invites',
    (f) => ({ method: 'post', url: `/api/v1/children/${f.childId}/invites` }),
    201,
    403,
  ],
  [
    'DELETE /api/v1/children/{childId}/invites/{inviteId}',
    (f) => ({ method: 'delete', url: `/api/v1/children/${f.childId}/invites/${f.inviteId}` }),
    204,
    403,
  ],
  // The owner removes dad; dad removing himself leaves.
  [
    'DELETE /api/v1/children/{childId}/members/{userId}',
    (f) => ({ method: 'delete', url: `/api/v1/children/${f.childId}/members/${f.dad.userId}` }),
    204,
    204,
  ],
  [
    'POST /api/v1/children/{childId}/transfer-ownership',
    (f) => ({
      method: 'post',
      url: `/api/v1/children/${f.childId}/transfer-ownership`,
      body: { userId: f.dad.userId },
    }),
    204,
    403,
  ],
  [
    'GET /api/v1/children/{childId}/days/{date}',
    (f) => ({ method: 'get', url: `/api/v1/children/${f.childId}/days/${TODAY}` }),
    200,
    200,
  ],
  [
    'PATCH /api/v1/meals/{mealId}',
    (f) => ({ method: 'patch', url: `/api/v1/meals/${f.lunchId}`, body: { status: 'prepared' } }),
    200,
    200,
  ],
  [
    'GET /api/v1/meals/{mealId}/swap-suggestions',
    (f) => ({ method: 'get', url: `/api/v1/meals/${f.lunchId}/swap-suggestions` }),
    200,
    200,
  ],
  [
    'POST /api/v1/meals/{mealId}/swap',
    (f) => ({
      method: 'post',
      url: `/api/v1/meals/${f.lunchId}/swap`,
      body: { dishId: f.swapTarget, reason: 'other' },
    }),
    200,
    200,
  ],
  [
    'GET /api/v1/children/{childId}/dishes',
    (f) => ({ method: 'get', url: `/api/v1/children/${f.childId}/dishes` }),
    200,
    200,
  ],
  [
    'GET /api/v1/children/{childId}/dishes/{dishId}',
    (f) => ({ method: 'get', url: `/api/v1/children/${f.childId}/dishes/${f.customDishId}` }),
    200,
    200,
  ],
  [
    'POST /api/v1/children/{childId}/custom-dishes',
    (f) => ({
      method: 'post',
      url: `/api/v1/children/${f.childId}/custom-dishes`,
      body: dish('Cháo yến mạch nhà làm'),
    }),
    201,
    201,
  ],
  [
    'GET /api/v1/children/{childId}/custom-dishes/{dishId}',
    (f) => ({
      method: 'get',
      url: `/api/v1/children/${f.childId}/custom-dishes/${f.customDishId}`,
    }),
    200,
    200,
  ],
  [
    'PUT /api/v1/children/{childId}/custom-dishes/{dishId}',
    (f) => ({
      method: 'put',
      url: `/api/v1/children/${f.childId}/custom-dishes/${f.customDishId}`,
      body: dish('Cháo gạo mới'),
    }),
    200,
    200,
  ],
  [
    'DELETE /api/v1/children/{childId}/custom-dishes/{dishId}',
    (f) => ({
      method: 'delete',
      url: `/api/v1/children/${f.childId}/custom-dishes/${f.customDishId}`,
    }),
    204,
    204,
  ],
  [
    'POST /api/v1/children/{childId}/urgent-events',
    (f) => ({ method: 'post', url: `/api/v1/children/${f.childId}/urgent-events`, body: {} }),
    201,
    201,
  ],
  [
    'PATCH /api/v1/urgent-events/{eventId}',
    (f) => ({
      method: 'patch',
      url: `/api/v1/urgent-events/${f.eventId}`,
      body: { contactedMedical: true },
    }),
    200,
    200,
  ],
  [
    'GET /api/v1/children/{childId}/paused-ingredients',
    (f) => ({ method: 'get', url: `/api/v1/children/${f.childId}/paused-ingredients` }),
    200,
    200,
  ],
  [
    'POST /api/v1/children/{childId}/paused-ingredients/{ingredientId}/resume',
    (f) => ({
      method: 'post',
      url: `/api/v1/children/${f.childId}/paused-ingredients/${f.pausedId}/resume`,
    }),
    204,
    403,
  ],
  [
    'GET /api/v1/meals/{mealId}/log',
    (f) => ({ method: 'get', url: `/api/v1/meals/${f.lunchId}/log` }),
    200,
    200,
  ],
  [
    'POST /api/v1/meals/{mealId}/log',
    (f) => ({
      method: 'post',
      url: `/api/v1/meals/${f.lunchId}/log`,
      body: { loggedAt: '2026-09-24T11:40:00+07:00', amount: 'half', liking: 3 },
    }),
    201,
    201,
  ],
  [
    'GET /api/v1/children/{childId}/journal',
    (f) => ({ method: 'get', url: `/api/v1/children/${f.childId}/journal` }),
    200,
    200,
  ],
  [
    'GET /api/v1/children/{childId}/health',
    (f) => ({ method: 'get', url: `/api/v1/children/${f.childId}/health` }),
    200,
    200,
  ],
  [
    'POST /api/v1/children/{childId}/health',
    (f) => ({
      method: 'post',
      url: `/api/v1/children/${f.childId}/health`,
      body: { status: 'sick', symptoms: ['fever'] },
    }),
    200,
    200,
  ],
  [
    'GET /api/v1/children/{childId}/health/preview',
    (f) => ({ method: 'get', url: `/api/v1/children/${f.childId}/health/preview?status=sick` }),
    200,
    200,
  ],
  [
    'GET /api/v1/children/{childId}/weeks/{weekStart}',
    (f) => ({ method: 'get', url: `/api/v1/children/${f.childId}/weeks/2026-09-21` }),
    200,
    200,
  ],
  [
    'POST /api/v1/children/{childId}/weeks/{weekStart}/generate',
    (f) => ({
      method: 'post',
      url: `/api/v1/children/${f.childId}/weeks/2026-09-28/generate`,
      body: { overwrite: true },
    }),
    200,
    200,
  ],
];

function send(f: Family, call: Call, as: Person) {
  const { method, url, body } = call(f);
  const req = api()[method](url).set('Authorization', as.authorization);
  return body ? req.send(body) : req;
}

describe('TC-FAM-011 access matrix (BR-73, BR-74)', () => {
  it('declares every route that reaches a child’s data (a new route must be added here)', () => {
    const spec = JSON.parse(
      readFileSync(new URL('../../openapi.json', import.meta.url), 'utf8'),
    ) as { paths: Record<string, Record<string, unknown>> };
    const scoped = Object.entries(spec.paths)
      .filter(([path]) => /\{(childId|mealId|eventId)\}/.test(path))
      .flatMap(([path, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${path}`))
      .sort();
    expect(MATRIX.map(([route]) => route).sort()).toEqual(scoped);
  });

  it.each(MATRIX)(
    '%s — owner %i, caregiver %i, stranger 404',
    async (_route, call, owner, caregiver) => {
      const f = await family();
      expect((await send(f, call, f.stranger)).status).toBe(404);
      const asCaregiver = await send(f, call, f.dad);
      expect(asCaregiver.status).toBe(caregiver);
      if (caregiver === 403) expect(asCaregiver.body.code).toBe('OWNER_ONLY');
      // A fresh family, so what the caregiver did does not change what the owner gets.
      const g = await family();
      expect((await send(g, call, g.mom)).status).toBe(owner);
    },
  );
});

describe('Invites (UC-20/21)', () => {
  it('TC-FAM-001 / TC-FAM-003 a public preview with little data, then the caregiver sees the child', async () => {
    const f = await family();
    const grandma = await signUp(app);
    const link = await invite(f.mom, f.childId);
    const preview = await api().get(`/api/v1/invites/${link.token}`).expect(200);
    expect(preview.body).toEqual({
      childName: 'Na',
      inviterName: expect.any(String),
      expiresAt: '2026-09-27T05:00:00.000Z',
    });
    await api().post(`/api/v1/invites/${link.token}/accept`).expect(401);
    const accepted = await api()
      .post(`/api/v1/invites/${link.token}/accept`)
      .set('Authorization', grandma.authorization)
      .expect(200);
    expect(accepted.body).toEqual({ childId: f.childId, role: 'caregiver' });
    const children = await api()
      .get('/api/v1/children')
      .set('Authorization', grandma.authorization);
    expect(children.body.map((c: { id: string; role: string }) => [c.id, c.role])).toEqual([
      [f.childId, 'caregiver'],
    ]);
    const members = await api()
      .get(`/api/v1/children/${f.childId}/members`)
      .set('Authorization', f.mom.authorization)
      .expect(200);
    expect(members.body.members.map((m: { role: string }) => m.role)).toEqual([
      'owner',
      'caregiver',
      'caregiver',
    ]);
    expect(members.body.pendingInvites).toHaveLength(1);
  });

  it('TC-FAM-005/006/008 used, revoked, unknown and expired links; a member opening a link', async () => {
    const f = await family();
    const used = await invite(f.mom, f.childId);
    const grandma = await signUp(app);
    await api()
      .post(`/api/v1/invites/${used.token}/accept`)
      .set('Authorization', grandma.authorization)
      .expect(200);
    const late = await signUp(app);
    expect(
      (
        await api()
          .post(`/api/v1/invites/${used.token}/accept`)
          .set('Authorization', late.authorization)
      ).body.code,
    ).toBe('INVITE_USED');
    await api()
      .delete(`/api/v1/children/${f.childId}/invites/${f.inviteId}`)
      .set('Authorization', f.mom.authorization)
      .expect(204);
    const own = await api()
      .post(`/api/v1/invites/${(await invite(f.mom, f.childId)).token}/accept`)
      .set('Authorization', f.mom.authorization);
    expect(own.status).toBe(409);
    expect(own.body).toMatchObject({ code: 'ALREADY_MEMBER', childId: f.childId });
    expect((await api().get('/api/v1/invites/not-a-real-token')).body.code).toBe(
      'INVITE_NOT_FOUND',
    );

    const expiring = await invite(f.mom, f.childId);
    clock.set('2026-09-27T05:00:00Z');
    const afterwards = await signUp(app);
    const expired = await api()
      .post(`/api/v1/invites/${expiring.token}/accept`)
      .set('Authorization', afterwards.authorization);
    expect([expired.status, expired.body.code]).toEqual([410, 'INVITE_EXPIRED']);
  });

  it('TC-FAM-006 a revoked link answers 410', async () => {
    const f = await family();
    const link = await invite(f.mom, f.childId);
    await api()
      .delete(`/api/v1/children/${f.childId}/invites/${link.id}`)
      .set('Authorization', f.mom.authorization)
      .expect(204);
    const res = await api().get(`/api/v1/invites/${link.token}`);
    expect([res.status, res.body.code]).toEqual([410, 'INVITE_REVOKED']);
  });

  it('TC-FAM-007 two people pressing "Tham gia" on one link: one gets in', async () => {
    const f = await family();
    const link = await invite(f.mom, f.childId);
    const [a, b] = [await signUp(app), await signUp(app)];
    const results = await Promise.all(
      [a, b].map((p) =>
        api().post(`/api/v1/invites/${link.token}/accept`).set('Authorization', p.authorization),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.childMember.count({ where: { childId: f.childId } })).toBe(3);
  });

  it('TC-FAM-027 opening links is throttled like signing in', async () => {
    const limited = await createTestApp({ env: { AUTH_RATE_LIMIT: '2' } });
    try {
      const open = () => request(limited.getHttpServer()).get('/api/v1/invites/x');
      await open().expect(404);
      await open().expect(404);
      await open().expect(429);
    } finally {
      await limited.close();
    }
  });
});

describe('Members (UC-22)', () => {
  it('TC-FAM-014 a removed caregiver is refused at the next request', async () => {
    const f = await family();
    await api()
      .delete(`/api/v1/children/${f.childId}/members/${f.dad.userId}`)
      .set('Authorization', f.mom.authorization)
      .expect(204);
    await api()
      .get(`/api/v1/children/${f.childId}/days/${TODAY}`)
      .set('Authorization', f.dad.authorization)
      .expect(404);
    expect(
      (await api().get('/api/v1/children').set('Authorization', f.dad.authorization)).body,
    ).toEqual([]);
  });

  it('TC-FAM-015/016 hands over the child; the old owner becomes a caregiver who may leave', async () => {
    const f = await family();
    const self = await api()
      .delete(`/api/v1/children/${f.childId}/members/${f.mom.userId}`)
      .set('Authorization', f.mom.authorization);
    expect([self.status, self.body.code]).toEqual([422, 'OWNER_CANNOT_LEAVE']);
    const outsider = await api()
      .post(`/api/v1/children/${f.childId}/transfer-ownership`)
      .set('Authorization', f.mom.authorization)
      .send({ userId: f.stranger.userId });
    expect(outsider.body.code).toBe('NOT_A_CAREGIVER');
    await api()
      .post(`/api/v1/children/${f.childId}/transfer-ownership`)
      .set('Authorization', f.mom.authorization)
      .send({ userId: f.dad.userId })
      .expect(204);
    await api()
      .patch(`/api/v1/children/${f.childId}`)
      .set('Authorization', f.mom.authorization)
      .send({ name: 'Bin' })
      .expect(403);
    await api()
      .patch(`/api/v1/children/${f.childId}`)
      .set('Authorization', f.dad.authorization)
      .send({ name: 'Bin' })
      .expect(200);
    await api()
      .delete(`/api/v1/children/${f.childId}/members/${f.mom.userId}`)
      .set('Authorization', f.mom.authorization)
      .expect(204);
    expect((await prisma.child.findUniqueOrThrow({ where: { id: f.childId } })).userId).toBe(
      f.dad.userId,
    );
  });

  it('TC-FAM-018/019 the owner must hand over before closing the account; a caregiver just leaves', async () => {
    const f = await family();
    const blocked = await api()
      .delete('/api/v1/me')
      .set('Authorization', f.mom.authorization)
      .send({ password: 'Cháo cá hồi 2026' })
      .expect(409);
    expect(blocked.body).toMatchObject({
      code: 'OWNERSHIP_TRANSFER_REQUIRED',
      children: [{ id: f.childId, name: 'Na' }],
    });
    await api()
      .delete('/api/v1/me')
      .set('Authorization', f.dad.authorization)
      .send({ password: 'Cháo cá hồi 2026' })
      .expect(204);
    const members = await api()
      .get(`/api/v1/children/${f.childId}/members`)
      .set('Authorization', f.mom.authorization);
    expect(members.body.members).toHaveLength(1);
    await api()
      .delete('/api/v1/me')
      .set('Authorization', f.mom.authorization)
      .send({ password: 'Cháo cá hồi 2026' })
      .expect(204);
  });
});

describe('Two parents at once (BR-77, BR-78)', () => {
  it('TC-FAM-020 / TC-FAM-024 the second log learns who logged; the day shows it', async () => {
    const f = await family();
    await api()
      .patch('/api/v1/me')
      .set('Authorization', f.dad.authorization)
      .send({ displayName: 'Ba' })
      .expect(200);
    const body = { loggedAt: '2026-09-24T11:40:00+07:00', amount: 'half', liking: 3 };
    await api()
      .post(`/api/v1/meals/${f.lunchId}/log`)
      .set('Authorization', f.dad.authorization)
      .send(body)
      .expect(201);
    const second = await api()
      .post(`/api/v1/meals/${f.lunchId}/log`)
      .set('Authorization', f.mom.authorization)
      .send(body)
      .expect(409);
    expect(second.body).toMatchObject({
      code: 'MEAL_ALREADY_LOGGED',
      loggedBy: 'Ba',
      loggedAt: '2026-09-24T04:40:00.000Z',
    });
    const day = await api()
      .get(`/api/v1/children/${f.childId}/days/${TODAY}`)
      .set('Authorization', f.mom.authorization);
    expect(day.body.meals.find((m: { id: string }) => m.id === f.lunchId).loggedBy).toEqual({
      name: 'Ba',
      at: '2026-09-24T04:40:00.000Z',
    });
    const journal = await api()
      .get(`/api/v1/children/${f.childId}/journal`)
      .set('Authorization', f.mom.authorization);
    expect(journal.body.entries.find((e: { kind: string }) => e.kind === 'meal').actorName).toBe(
      'Ba',
    );
  });

  it('TC-FAM-021 a swap chosen on an outdated meal is refused', async () => {
    const f = await family();
    const res = await api()
      .post(`/api/v1/meals/${f.lunchId}/swap`)
      .set('Authorization', f.mom.authorization)
      .send({ dishId: f.swapTarget, reason: 'other', expectedDishId: 'dish_outdated' });
    expect([res.status, res.body.code]).toEqual([409, 'MEAL_CHANGED']);
  });

  it('TC-FAM-025 display name: 30 characters fine, 31 refused, blank clears it', async () => {
    const f = await family();
    const ok = await api()
      .patch('/api/v1/me')
      .set('Authorization', f.dad.authorization)
      .send({ displayName: 'x'.repeat(30) });
    expect(ok.body.displayName).toHaveLength(30);
    const tooLong = await api()
      .patch('/api/v1/me')
      .set('Authorization', f.dad.authorization)
      .send({ displayName: 'x'.repeat(31) });
    expect([tooLong.status, tooLong.body.code]).toEqual([400, 'INVALID_DISPLAY_NAME']);
    const cleared = await api()
      .patch('/api/v1/me')
      .set('Authorization', f.dad.authorization)
      .send({ displayName: '  ' });
    expect(cleared.body.displayName).toBeNull();
  });
});

describe('NFR-017 / TC-FAM-030 another family’s object under your own child', () => {
  const as = (p: Person) => ({ Authorization: p.authorization });

  it('hides another family’s custom dish behind your child id: read, recipe, edit, delete', async () => {
    const [f, g] = [await family(), await family()];
    const own = `/api/v1/children/${f.childId}`;
    const calls = [
      api().get(`${own}/custom-dishes/${g.customDishId}`).set(as(f.mom)),
      api().get(`${own}/dishes/${g.customDishId}`).set(as(f.mom)),
      api().put(`${own}/custom-dishes/${g.customDishId}`).set(as(f.mom)).send(dish('Đổi tên')),
      api().delete(`${own}/custom-dishes/${g.customDishId}`).set(as(f.mom)),
    ];
    for (const res of await Promise.all(calls)) {
      expect([res.status, res.body.code]).toEqual([404, 'DISH_NOT_FOUND']);
    }
    // Still there, unchanged, for its own family.
    const theirs = await api()
      .get(`/api/v1/children/${g.childId}/custom-dishes/${g.customDishId}`)
      .set(as(g.mom))
      .expect(200);
    expect(theirs.body.name).toBe('Cháo gạo yến mạch');
  });

  it('refuses to swap your meal to another family’s custom dish', async () => {
    const [f, g] = [await family(), await family()];
    const swap = await api()
      .post(`/api/v1/meals/${f.lunchId}/swap`)
      .set(as(f.mom))
      .send({ dishId: g.customDishId, reason: 'other' })
      .expect(404);
    expect(swap.body.code).toBe('DISH_NOT_FOUND');
  });

  it('resumes only a food paused for this child, and only for its members', async () => {
    const [f, g] = [await family(), await family()];
    const notPaused = await api()
      .post(`/api/v1/children/${f.childId}/paused-ingredients/ing_thit_bo/resume`)
      .set(as(f.mom))
      .expect(409);
    expect(notPaused.body.code).toBe('INGREDIENT_NOT_PAUSED');
    // Another family's owner, with an ingredient that is paused for this child.
    const stranger = await api()
      .post(`/api/v1/children/${f.childId}/paused-ingredients/${f.pausedId}/resume`)
      .set(as(g.mom))
      .expect(404);
    expect(stranger.body.code).toBe('CHILD_NOT_FOUND');
  });
});
