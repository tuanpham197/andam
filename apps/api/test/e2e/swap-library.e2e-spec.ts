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

// 09:00 on 24/09/2026 in Vietnam.
const clock = new FixedClock(new Date('2026-09-24T02:00:00Z'));
const TODAY = '2026-09-24';
let app: INestApplication;
let prisma: PrismaService;
let owner: string;
let stranger: string;
let childId: string;

const api = () => request(app.getHttpServer());

beforeAll(async () => {
  app = await createTestApp({ overrides: [[CLOCK, clock]] });
  prisma = app.get(PrismaService);
  await resetDatabase(prisma);
  await seedCatalog(prisma, await loadCatalog(REPO_CATALOG_DIR));
});

beforeEach(async () => {
  clock.set('2026-09-24T02:00:00Z');
  ({ authorization: owner } = await signUp(app));
  ({ authorization: stranger } = await signUp(app));
  const res = await api()
    .post('/api/v1/children')
    .set('Authorization', owner)
    .send({
      name: 'Na',
      birthDate: '2026-01-12',
      isPremature: false,
      priorReaction: 'never',
      avoidAllergens: ['egg'],
      avoidIngredients: [],
    })
    .expect(201);
  childId = res.body.id;
});

afterAll(() => app.close());

async function lunch() {
  const day = await api()
    .get(`/api/v1/children/${childId}/days/${TODAY}`)
    .set('Authorization', owner)
    .expect(200);
  return day.body.meals.find((m: { slot: string }) => m.slot === 'lunch') as {
    id: string;
    dish: { id: string };
  };
}

describe('GET /meals/:id/swap-suggestions (UC-06)', () => {
  it('ranks replacements for "Thiếu nguyên liệu" by default, none built on the same main food', async () => {
    const meal = await lunch();
    const res = await api()
      .get(`/api/v1/meals/${meal.id}/swap-suggestions`)
      .set('Authorization', owner)
      .expect(200);
    expect(res.body).toMatchObject({
      meal: { id: meal.id, slot: 'lunch', time: '11:00', dish: { id: meal.dish.id } },
      reason: 'missing_ingredient',
      excluded: { total: 0 },
      relaxedWindowDays: null,
    });
    expect(res.body.ranked.length).toBeGreaterThan(0);
    expect(res.body.ranked[0].reasons.length).toBeLessThanOrEqual(3);
    const mains = await prisma.dishIngredient.findMany({ where: { isMain: true } });
    const mainOf = (dishId: string) =>
      mains.filter((m) => m.dishId === dishId).map((m) => m.ingredientId);
    for (const c of res.body.ranked as { dish: { id: string } }[])
      expect(mainOf(c.dish.id)).not.toEqual(expect.arrayContaining(mainOf(meal.dish.id)));
  });

  it('"Cần nấu nhanh hơn" offers only quicker dishes', async () => {
    const meal = await lunch();
    const res = await api()
      .get(`/api/v1/meals/${meal.id}/swap-suggestions?reason=faster`)
      .set('Authorization', owner)
      .expect(200);
    for (const c of res.body.ranked) {
      expect(c.fasterByMin).toBeGreaterThan(0);
      expect(c.reasons[0]).toBe('FASTER');
    }
  });

  it('counts dishes the safety filter removed', async () => {
    await api()
      .put(`/api/v1/children/${childId}/avoid-list`)
      .set('Authorization', owner)
      .send({ allergens: ['egg', 'fish'], ingredients: [] })
      .expect(200);
    const meal = await lunch();
    const res = await api()
      .get(`/api/v1/meals/${meal.id}/swap-suggestions?reason=other`)
      .set('Authorization', owner)
      .expect(200);
    expect(res.body.excluded.byReason.allergen).toBe(2);
    expect(JSON.stringify(res.body.ranked)).not.toContain('dish_chao_ca_');
  });

  it('TC-SWP-005 answers 400 for an unknown reason, 404 to a stranger, 400 for a bad id', async () => {
    const meal = await lunch();
    await api()
      .get(`/api/v1/meals/${meal.id}/swap-suggestions?reason=abc`)
      .set('Authorization', owner)
      .expect(400);
    const notMine = await api()
      .get(`/api/v1/meals/${meal.id}/swap-suggestions`)
      .set('Authorization', stranger)
      .expect(404);
    expect(notMine.body.code).toBe('MEAL_NOT_FOUND');
    await api().get('/api/v1/meals/abc/swap-suggestions').set('Authorization', owner).expect(400);
  });
});

describe('POST /meals/:id/swap (FR-045)', () => {
  it('swaps the dish, shows it in the day and keeps the history with the reason', async () => {
    const meal = await lunch();
    const suggestions = await api()
      .get(`/api/v1/meals/${meal.id}/swap-suggestions?reason=disliked`)
      .set('Authorization', owner)
      .expect(200);
    const target = suggestions.body.ranked[0].dish.id;
    const res = await api()
      .post(`/api/v1/meals/${meal.id}/swap`)
      .set('Authorization', owner)
      .send({ dishId: target, reason: 'disliked' })
      .expect(200);
    expect(res.body).toMatchObject({ id: meal.id, status: 'planned', dish: { id: target } });
    expect((await lunch()).dish.id).toBe(target);
    expect(await prisma.swapEvent.findMany({ where: { mealId: meal.id } })).toEqual([
      expect.objectContaining({ fromDishId: meal.dish.id, toDishId: target, reason: 'disliked' }),
    ]);
    // A signal only: the avoid list is untouched (BR-29).
    const child = await api().get(`/api/v1/children/${childId}`).set('Authorization', owner);
    expect(child.body.avoidIngredients).toEqual([]);
  });

  it('TC-SWP-008 refuses a dish the child must avoid, even sent by hand', async () => {
    await api()
      .put(`/api/v1/children/${childId}/avoid-list`)
      .set('Authorization', owner)
      .send({ allergens: ['egg', 'fish'], ingredients: [] })
      .expect(200);
    const meal = await lunch();
    const res = await api()
      .post(`/api/v1/meals/${meal.id}/swap`)
      .set('Authorization', owner)
      .send({ dishId: 'dish_chao_ca_loc_bi_xanh', reason: 'other' })
      .expect(422);
    expect(res.body.code).toBe('DISH_NOT_SAFE_FOR_CHILD');
    expect(await prisma.swapEvent.count({ where: { mealId: meal.id } })).toBe(0);
  });

  it('TC-SWP-007/009 answers SAME_DISH, DISH_NOT_FOUND, DISH_NOT_FOR_SLOT and 400 for a bad body', async () => {
    const meal = await lunch();
    const send = (body: object) =>
      api().post(`/api/v1/meals/${meal.id}/swap`).set('Authorization', owner).send(body);
    expect((await send({ dishId: meal.dish.id, reason: 'other' }).expect(422)).body.code).toBe(
      'SAME_DISH',
    );
    expect((await send({ dishId: 'dish_khong_co', reason: 'other' }).expect(404)).body.code).toBe(
      'DISH_NOT_FOUND',
    );
    expect(
      (await send({ dishId: 'dish_le_hap_nghien', reason: 'other' }).expect(422)).body.code,
    ).toBe('DISH_NOT_FOR_SLOT');
    await send({ dishId: 'dish_chao_bo_bi_do' }).expect(400);
    await send({ dishId: '', reason: 'other' }).expect(400);
  });

  it('TC-SWP-010 refuses a meal of a past day', async () => {
    const meal = await lunch();
    // Stored directly: the API never plans a past day (TC-PLN-002).
    const row = await prisma.plannedMeal.findUniqueOrThrow({ where: { id: meal.id } });
    const past = await prisma.plannedMeal.create({
      data: {
        ...row,
        id: '00000000-0000-4000-8000-0000000000aa',
        date: new Date('2026-09-23T00:00:00Z'),
        newIngredientIds: row.newIngredientIds,
      },
    });
    const res = await api()
      .post(`/api/v1/meals/${past.id}/swap`)
      .set('Authorization', owner)
      .send({ dishId: 'dish_chao_bo_bi_do', reason: 'other' })
      .expect(422);
    expect(res.body.code).toBe('MEAL_IN_PAST');
  });

  it('TC-SWP-011 two swaps at once: both recorded, the meal ends on one of them', async () => {
    const meal = await lunch();
    const targets = ['dish_chao_bo_bi_do', 'dish_chao_heo_ca_rot', 'dish_chao_ga_khoai_tay']
      .filter((id) => id !== meal.dish.id)
      .slice(0, 2);
    const [a, b] = await Promise.all(
      targets
        .slice(0, 2)
        .map((dishId) =>
          api()
            .post(`/api/v1/meals/${meal.id}/swap`)
            .set('Authorization', owner)
            .send({ dishId, reason: 'other' }),
        ),
    );
    expect([a!.status, b!.status]).toEqual([200, 200]);
    expect(await prisma.swapEvent.count({ where: { mealId: meal.id } })).toBe(2);
    expect(targets).toContain((await lunch()).dish.id);
  });
});

describe('GET /children/:id/dishes (UC-07)', () => {
  it('lists the library for the child with tags, hiding what is unsafe', async () => {
    await api()
      .put(`/api/v1/children/${childId}/avoid-list`)
      .set('Authorization', owner)
      .send({ allergens: ['egg', 'fish'], ingredients: [] })
      .expect(200);
    const res = await api()
      .get(`/api/v1/children/${childId}/dishes`)
      .set('Authorization', owner)
      .expect(200);
    expect(res.body.dishes).toHaveLength(10);
    expect(
      res.body.dishes.find((d: { id: string }) => d.id === 'dish_chao_bo_bi_do'),
    ).toMatchObject({
      name: 'Cháo bò bí đỏ',
      mealType: 'main',
      mainProtein: 'beef',
      texture: 'lumpy',
      liked: false,
      lastEaten: null,
    });
    expect(res.body.hidden).toMatchObject({ total: 2, byReason: { allergen: 2 } });
    expect(res.body.hidden.items.map((i: { name: string }) => i.name).sort()).toEqual([
      'Cháo cá hồi rau ngót',
      'Cháo cá lóc bí xanh',
    ]);
  });

  it('filters by chip, accent-free search and "Chưa ăn 7 ngày"', async () => {
    const get = (query: string) =>
      api()
        .get(`/api/v1/children/${childId}/dishes?${query}`)
        .set('Authorization', owner)
        .expect(200)
        .then((r) => r.body.dishes.map((d: { id: string }) => d.id).sort());
    expect(await get('chip=beef')).toEqual(['dish_chao_bo_bi_do', 'dish_chao_bo_cai_bo_xoi']);
    expect(await get('q=thit%20ga')).toEqual(['dish_chao_ga_bi_do', 'dish_chao_ga_khoai_tay']);
    expect(await get(`q=${encodeURIComponent('bơ')}`)).toEqual(['dish_bo_chuoi_nghien']);
    expect(await get('chip=snack&fresh=true')).toHaveLength(3);
  });

  it('TC-LIB-005 answers 400 for an unknown chip or flag, 404 for another family’s child', async () => {
    const base = `/api/v1/children/${childId}/dishes`;
    await api().get(`${base}?chip=xyz`).set('Authorization', owner).expect(400);
    await api().get(`${base}?fresh=maybe`).set('Authorization', owner).expect(400);
    await api()
      .get(`${base}?q=${'a'.repeat(101)}`)
      .set('Authorization', owner)
      .expect(400);
    await api().get(base).set('Authorization', stranger).expect(404);
  });
});
