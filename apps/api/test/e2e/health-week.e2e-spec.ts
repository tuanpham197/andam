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

// 09:00 on Thursday 24/09/2026 in Vietnam.
const clock = new FixedClock(new Date('2026-09-24T02:00:00Z'));
const TODAY = '2026-09-24';
const TOMORROW = '2026-09-25';
const THIS_WEEK = '2026-09-21';
const NEXT_WEEK = '2026-09-28';
let app: INestApplication;
let prisma: PrismaService;
let owner: string;
let stranger: string;
let childId: string;

interface Meal {
  id: string;
  slot: string;
  status: string;
  texture: string;
  portionText: string;
  dish: { id: string };
}

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
  const res = await http()
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
  // Every food already tried, so a sick day still has dishes without first tries (BR-52).
  const ingredients = await prisma.ingredient.findMany({ select: { id: true } });
  await prisma.ingredientExposure.createMany({
    data: ingredients.map((i) => ({ childId, ingredientId: i.id, status: 'tried' as const })),
  });
});

afterAll(() => app.close());

const http = () => request(app.getHttpServer());
const getDay = (date: string) =>
  http().get(`/api/v1/children/${childId}/days/${date}`).set('Authorization', owner).expect(200);
const setHealth = (body: object, auth = owner) =>
  http().post(`/api/v1/children/${childId}/health`).set('Authorization', auth).send(body);
const mainsOf = (meals: Meal[]) => meals.filter((m) => !m.slot.endsWith('snack'));

describe('child health (UC-11, FR-080..084)', () => {
  it('reads "Bình thường" for a new child', async () => {
    const res = await http()
      .get(`/api/v1/children/${childId}/health`)
      .set('Authorization', owner)
      .expect(200);
    expect(res.body).toEqual({
      status: 'normal',
      symptoms: [],
      startDate: null,
      expectedEndDate: null,
      overdue: false,
    });
  });

  it('TC-HLT-008/010 sick → recovering → normal re-plans upcoming meals, the prepared one stays', async () => {
    const today = (await getDay(TODAY)).body.meals as Meal[];
    await getDay(TOMORROW);
    const lunch = today.find((m) => m.slot === 'lunch')!;
    await http()
      .patch(`/api/v1/meals/${lunch.id}`)
      .set('Authorization', owner)
      .send({ status: 'prepared' })
      .expect(200);

    const sick = await setHealth({
      status: 'sick',
      symptoms: ['fever', 'poor_appetite'],
      expectedEndDate: '2026-09-26',
    }).expect(200);
    expect(sick.body).toMatchObject({ status: 'sick', startDate: TODAY, overdue: false });

    const sickToday = (await getDay(TODAY)).body.meals as Meal[];
    expect(sickToday.find((m) => m.id === lunch.id)).toMatchObject({
      status: 'prepared',
      texture: 'lumpy',
    });
    expect(sickToday.find((m) => m.slot === 'dinner')!.texture).toBe('mashed');
    const sickTomorrow = (await getDay(TOMORROW)).body;
    expect(sickTomorrow.meals.length + sickTomorrow.unfilledSlots.length).toBe(5);
    expect(mainsOf(sickTomorrow.meals).every((m: Meal) => m.texture === 'mashed')).toBe(true);

    await setHealth({ status: 'recovering', symptoms: [] }).expect(200);
    const recovering = (await getDay(TOMORROW)).body.meals as Meal[];
    expect(recovering).toHaveLength(4);
    expect(mainsOf(recovering).every((m) => m.texture === 'lumpy')).toBe(true);
    expect(mainsOf(recovering)[0]!.portionText).toMatch(/ml|ít hơn bình thường/);

    const normal = await setHealth({ status: 'normal', symptoms: ['cough'] }).expect(200);
    expect(normal.body).toMatchObject({ status: 'normal', symptoms: [] });
    const back = (await getDay(TOMORROW)).body.meals as Meal[];
    expect(mainsOf(back).every((m) => !m.portionText.includes('ít hơn'))).toBe(true);
  });

  it('TC-HLT-009 flags the episode once its expected end has passed', async () => {
    await setHealth({
      status: 'sick',
      symptoms: [],
      startDate: '2026-09-22',
      expectedEndDate: '2026-09-23',
    }).expect(200);
    const res = await http()
      .get(`/api/v1/children/${childId}/health`)
      .set('Authorization', owner)
      .expect(200);
    expect(res.body).toMatchObject({ status: 'sick', overdue: true });
  });

  it('TC-HLT-005/011 rejects an end before the start and a start too far ahead', async () => {
    const early = await setHealth({
      status: 'sick',
      symptoms: [],
      startDate: TODAY,
      expectedEndDate: '2026-09-23',
    }).expect(422);
    expect(early.body.code).toBe('HEALTH_END_BEFORE_START');
    const far = await setHealth({ status: 'sick', symptoms: [], startDate: '2026-10-05' }).expect(
      422,
    );
    expect(far.body.code).toBe('HEALTH_START_TOO_FAR');
  });

  it('validates the shape and hides another user’s child', async () => {
    await setHealth({ status: 'tired', symptoms: [] }).expect(400);
    await setHealth({ status: 'sick', symptoms: ['headache'] }).expect(400);
    await setHealth({ status: 'sick', symptoms: [], startDate: '24/09/2026' }).expect(400);
    await setHealth({ status: 'sick', symptoms: [] }, stranger).expect(404);
    await http()
      .get(`/api/v1/children/${childId}/health`)
      .set('Authorization', stranger)
      .expect(404);
  });

  it('FR-083 previews what the menu does for a status', async () => {
    const res = await http()
      .get(`/api/v1/children/${childId}/health/preview?status=sick`)
      .set('Authorization', owner)
      .expect(200);
    expect(res.body).toEqual({
      status: 'sick',
      extraSnacks: 1,
      portionPercent: 70,
      softerTexture: 1,
      pauseNewFoods: true,
    });
    await http()
      .get(`/api/v1/children/${childId}/health/preview`)
      .set('Authorization', owner)
      .expect(400);
    await http()
      .get(`/api/v1/children/${childId}/health/preview?status=sick`)
      .set('Authorization', stranger)
      .expect(404);
  });
});

describe('week plan (UC-12/13, FR-090..095)', () => {
  const getWeek = (weekStart: string, auth = owner) =>
    http().get(`/api/v1/children/${childId}/weeks/${weekStart}`).set('Authorization', auth);
  const generate = (weekStart: string, body: object = {}) =>
    http()
      .post(`/api/v1/children/${childId}/weeks/${weekStart}/generate`)
      .set('Authorization', owner)
      .send(body);

  it('shows the week with its indicators; egg is avoided by the profile (TC-WK-002)', async () => {
    const res = await getWeek(THIS_WEEK).expect(200);
    expect(res.body.weekStart).toBe(THIS_WEEK);
    expect(res.body.days).toHaveLength(7);
    const counts = res.body.days.map((d: { meals: Meal[] }) => d.meals.length);
    expect(counts.slice(0, 3)).toEqual([0, 0, 0]);
    // The 12-dish dev catalog cannot fill a whole week without repeats (BR-21); see P7.
    expect(counts.slice(3, 6)).toEqual([4, 4, 4]);
    expect(res.body.stats.totalMeals).toBe(counts.reduce((a: number, b: number) => a + b, 0));
    expect(res.body.stats.distinctDishes).toBeGreaterThan(1);
    expect(res.body.stats.proteinRotation).toHaveLength(6);
    expect(
      res.body.stats.proteinRotation.find((p: { protein: string }) => p.protein === 'egg'),
    ).toEqual({ protein: 'egg', meals: 0, avoided: true });
  });

  it('TC-WK-007 answers 400 when the week does not start on Monday, 404 for a stranger', async () => {
    const res = await getWeek('2026-09-22').expect(400);
    expect(res.body.code).toBe('INVALID_WEEK_START');
    await getWeek(THIS_WEEK, stranger).expect(404);
  });

  it('TC-WK-005 asks before replacing next week, then re-plans it', async () => {
    await getWeek(NEXT_WEEK).expect(200);
    const conflict = await generate(NEXT_WEEK).expect(409);
    expect(conflict.body.code).toBe('PLAN_EXISTS');
    const res = await generate(NEXT_WEEK, { overwrite: true }).expect(200);
    const meals = res.body.days.flatMap((d: { meals: Meal[] }) => d.meals);
    expect(meals.length).toBeGreaterThan(0);
    expect(res.body.stats.totalMeals).toBe(meals.length);
  });

  it('TC-WK-006 refuses a week further than the next one', async () => {
    const res = await generate('2026-10-05').expect(422);
    expect(res.body.code).toBe('WEEK_OUT_OF_RANGE');
    await generate(NEXT_WEEK, { overwrite: 'yes' }).expect(400);
  });

  it('TC-WK-008 indicators follow a swap at once', async () => {
    const before = (await getWeek(THIS_WEEK).expect(200)).body;
    const dinner = (before.days[4].meals as Meal[]).find((m) => m.slot === 'dinner')!;
    const library = await http()
      .get(`/api/v1/children/${childId}/dishes`)
      .set('Authorization', owner)
      .expect(200);
    const dishId = (library.body.dishes as { id: string; mealType: string }[]).find(
      (d) => d.mealType === 'main' && d.id !== dinner.dish.id,
    )!.id;
    await http()
      .post(`/api/v1/meals/${dinner.id}/swap`)
      .set('Authorization', owner)
      .send({ dishId, reason: 'other' })
      .expect(200);

    const after = (await getWeek(THIS_WEEK).expect(200)).body;
    const ids = after.days.flatMap((d: { meals: Meal[] }) => d.meals.map((m) => m.dish.id));
    expect(ids).toContain(dishId);
    expect(after.stats.distinctDishes).toBe(new Set(ids).size);
  });
});
