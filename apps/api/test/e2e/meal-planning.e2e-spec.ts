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
let owner: string;
let stranger: string;
let childId: string;

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
  const res = await request(app.getHttpServer())
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

const http = () => request(app.getHttpServer());
const getDay = (date = TODAY, auth = owner) =>
  http().get(`/api/v1/children/${childId}/days/${date}`).set('Authorization', auth);

describe('GET /api/v1/children/:childId/days/:date (UC-04)', () => {
  it('plans bé Na’s day: 3 meals and a snack at the GĐ2 times, with dish details', async () => {
    const res = await getDay().expect(200);
    expect(res.body.plannable).toBe(true);
    expect(
      res.body.meals.map((m: { slot: string; time: string }) => `${m.slot}@${m.time}`),
    ).toEqual(['breakfast@07:30', 'lunch@11:00', 'afternoon_snack@15:00', 'dinner@18:00']);
    const lunch = res.body.meals[1];
    expect(lunch).toMatchObject({
      status: 'planned',
      texture: 'lumpy',
      dish: { name: expect.any(String), prepMin: expect.any(Number), cookMin: expect.any(Number) },
    });
    expect(lunch.dish.foodGroups).toEqual(['carb', 'protein', 'fat', 'veg']);
    expect(res.body.nextMealId).toBe(res.body.meals[0].id);
  });

  it('flags first tries for a child with no history (FR-024)', async () => {
    const res = await getDay().expect(200);
    const mains = res.body.meals.filter((m: { slot: string }) => !m.slot.endsWith('snack'));
    expect(mains.every((m: { newIngredients: unknown[] }) => m.newIngredients.length > 0)).toBe(
      true,
    );
  });

  it('keeps the stored plan on later reads', async () => {
    const first = await getDay();
    const second = await getDay();
    expect(second.body.meals.map((m: { id: string }) => m.id)).toEqual(
      first.body.meals.map((m: { id: string }) => m.id),
    );
  });

  it('TC-PLN-001 stores one plan when two first reads arrive together', async () => {
    const [a, b] = await Promise.all([getDay(), getDay()]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.meals.map((m: { id: string }) => m.id)).toEqual(
      b.body.meals.map((m: { id: string }) => m.id),
    );
  });

  it('TC-PLN-002 does not plan a past day', async () => {
    const res = await getDay('2026-09-20').expect(200);
    expect(res.body).toMatchObject({ meals: [], unfilledSlots: [], nextMealId: null });
  });

  it('answers 400 for an impossible date, 404 for another user’s child, 400 for a bad id', async () => {
    expect((await getDay('2026-02-30').expect(400)).body).toMatchObject({ code: 'INVALID_DATE' });
    expect((await getDay(TODAY, stranger).expect(404)).body).toMatchObject({
      code: 'CHILD_NOT_FOUND',
    });
    await http()
      .get(`/api/v1/children/not-a-uuid/days/${TODAY}`)
      .set('Authorization', owner)
      .expect(400);
  });

  it('BR-31 replaces upcoming fish meals when fish is added to the avoid list', async () => {
    const before = await getDay();
    await http()
      .put(`/api/v1/children/${childId}/avoid-list`)
      .set('Authorization', owner)
      .send({ allergens: ['egg', 'fish'], ingredients: [] })
      .expect(200);
    const after = await getDay();
    const upcoming = after.body.meals.filter((m: { time: string }) => m.time > '09:00');
    expect(
      upcoming.some((m: { dish: { mainProtein: string } }) => m.dish.mainProtein === 'fish'),
    ).toBe(false);
    const breakfast = (r: request.Response) =>
      r.body.meals.find((m: { slot: string }) => m.slot === 'breakfast');
    expect(breakfast(after).dish.id).toBe(breakfast(before).dish.id); // 07:30 already passed
  });
});

describe('PATCH /api/v1/meals/:mealId (FR-025)', () => {
  it('marks my meal as prepared', async () => {
    const { body } = await getDay();
    const res = await http()
      .patch(`/api/v1/meals/${body.meals[1].id}`)
      .set('Authorization', owner)
      .send({ status: 'prepared' })
      .expect(200);
    expect(res.body).toEqual({ id: body.meals[1].id, status: 'prepared' });
  });

  it('answers 404 for another user’s meal and 400 for anything but "prepared"', async () => {
    const { body } = await getDay();
    const id = body.meals[0].id;
    expect(
      (
        await http()
          .patch(`/api/v1/meals/${id}`)
          .set('Authorization', stranger)
          .send({ status: 'prepared' })
          .expect(404)
      ).body,
    ).toMatchObject({ code: 'MEAL_NOT_FOUND' });
    await http()
      .patch(`/api/v1/meals/${id}`)
      .set('Authorization', owner)
      .send({ status: 'eaten' })
      .expect(400);
    await http()
      .patch('/api/v1/meals/not-a-uuid')
      .set('Authorization', owner)
      .send({ status: 'prepared' })
      .expect(400);
  });
});

describe('GET /api/v1/children/:childId/dishes/:dishId (UC-05)', () => {
  const recipe = (query = '') =>
    http()
      .get(`/api/v1/children/${childId}/dishes/dish_chao_ca_hoi_rau_ngot${query}`)
      .set('Authorization', owner);

  it('shows the recipe at the child’s stage, with first tries and allergens', async () => {
    const res = await recipe().expect(200);
    expect(res.body).toMatchObject({
      name: 'Cháo cá hồi rau ngót',
      selectedStage: 2,
      stages: [1, 2, 3],
      allergens: ['fish'],
      foodGroups: ['carb', 'protein', 'fat', 'veg'],
      exclusion: null,
      tool: 'Nồi',
    });
    expect(
      res.body.ingredients.find((i: { ingredientId: string }) => i.ingredientId === 'ing_rau_ngot'),
    ).toMatchObject({
      name: 'Rau ngót',
      isNew: true,
    });
    expect(res.body.variants[0]).toMatchObject({ stage: 1, texture: 'puree_smooth' });
  });

  it('FR-028 shows another stage on request', async () => {
    expect((await recipe('?stage=1').expect(200)).body.selectedStage).toBe(1);
  });

  it('answers 404 for an unknown dish and 400 for a stage outside 1–4', async () => {
    const res = await http()
      .get(`/api/v1/children/${childId}/dishes/dish_khong_co`)
      .set('Authorization', owner)
      .expect(404);
    expect(res.body).toMatchObject({ code: 'DISH_NOT_FOUND' });
    await recipe('?stage=9').expect(400);
  });
});
