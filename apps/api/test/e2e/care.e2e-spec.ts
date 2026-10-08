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

// 12:00 on 24/09/2026 in Vietnam: lunch (11:00) is over, dinner (18:00) still ahead.
const NOON = '2026-09-24T05:00:00Z';
const clock = new FixedClock(new Date(NOON));
const TODAY = '2026-09-24';
const TOMORROW = '2026-09-25';
let app: INestApplication;
let prisma: PrismaService;
let owner: string;
let stranger: string;
let childId: string;

const api = () => request(app.getHttpServer());

type Meal = { id: string; slot: string; time: string; status: string; dish: { id: string } };

beforeAll(async () => {
  app = await createTestApp({ overrides: [[CLOCK, clock]] });
  prisma = app.get(PrismaService);
  await resetDatabase(prisma);
  await seedCatalog(prisma, await loadCatalog(REPO_CATALOG_DIR));
});

beforeEach(async () => {
  clock.set(NOON);
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

async function day(date = TODAY): Promise<Meal[]> {
  const res = await api()
    .get(`/api/v1/children/${childId}/days/${date}`)
    .set('Authorization', owner)
    .expect(200);
  return res.body.meals;
}

const lunch = async () => (await day()).find((m) => m.slot === 'lunch')!;

const logBody = (overrides: Record<string, unknown> = {}) => ({
  loggedAt: '2026-09-24T11:40:00+07:00',
  amount: 'half',
  liking: 3,
  ...overrides,
});

const dishFoods = async (dishId: string) =>
  (await prisma.dishIngredient.findMany({ where: { dishId } })).map((l) => l.ingredientId);

describe('GET/POST /meals/:id/log (UC-08/09)', () => {
  it('TC-LOG-001 shows the form, logs the meal, closes it and marks its foods tried', async () => {
    const meal = await lunch();
    const form = await api()
      .get(`/api/v1/meals/${meal.id}/log`)
      .set('Authorization', owner)
      .expect(200);
    expect(form.body).toMatchObject({
      meal: { id: meal.id, date: TODAY, slot: 'lunch', status: 'planned', dish: { custom: false } },
      log: null,
    });
    expect(form.body.firstTryIngredients.length).toBeGreaterThan(0);

    const res = await api()
      .post(`/api/v1/meals/${meal.id}/log`)
      .set('Authorization', owner)
      .send(logBody())
      .expect(201);
    expect(res.body).toEqual({
      log: {
        id: expect.any(String),
        mealId: meal.id,
        loggedAt: '2026-09-24T04:40:00.000Z',
        loggedBy: expect.any(String),
        amount: 'half',
        liking: 3,
        outcome: 'eaten',
        reaction: null,
      },
      pausedIngredients: [],
    });
    expect((await lunch()).status).toBe('eaten');
    const tried = await prisma.ingredientExposure.findMany({ where: { childId, status: 'tried' } });
    expect(tried.map((e) => e.ingredientId).sort()).toEqual((await dishFoods(meal.dish.id)).sort());
    const again = await api().get(`/api/v1/meals/${meal.id}/log`).set('Authorization', owner);
    expect(again.body.log).toMatchObject({ amount: 'half', outcome: 'eaten' });
  });

  it('TC-LOG-009 / TC-LOG-015 a reaction pauses the first tries; upcoming meals, swaps and library drop them', async () => {
    await day(TOMORROW);
    const meal = await lunch();
    const res = await api()
      .post(`/api/v1/meals/${meal.id}/log`)
      .set('Authorization', owner)
      .send(
        logBody({
          amount: 'quarter',
          liking: 2,
          reaction: { symptoms: ['rash', 'rash'], severity: 'mild', note: '<script>x</script>' },
        }),
      )
      .expect(201);
    const paused = res.body.pausedIngredients as { id: string; name: string }[];
    expect(paused.length).toBeGreaterThan(0);
    expect(res.body.log.reaction).toEqual({
      symptoms: ['rash'],
      severity: 'mild',
      note: '<script>x</script>',
    });
    const pausedIds = paused.map((p) => p.id);
    const upcoming = [...(await day()).filter((m) => m.time > '12:00'), ...(await day(TOMORROW))];
    for (const m of upcoming) {
      expect((await dishFoods(m.dish.id)).some((id) => pausedIds.includes(id))).toBe(false);
    }
    const dinner = (await day()).find((m) => m.slot === 'dinner')!;
    const swaps = await api()
      .get(`/api/v1/meals/${dinner.id}/swap-suggestions?reason=other`)
      .set('Authorization', owner)
      .expect(200);
    for (const c of swaps.body.ranked as { dish: { id: string } }[]) {
      expect((await dishFoods(c.dish.id)).some((id) => pausedIds.includes(id))).toBe(false);
    }
    const library = await api()
      .get(`/api/v1/children/${childId}/dishes`)
      .set('Authorization', owner)
      .expect(200);
    expect(library.body.hidden.byReason.paused).toBeGreaterThan(0);
  });

  it('TC-LOG-005 two parents saving at once: one log, the other told it was done', async () => {
    const meal = await lunch();
    const [a, b] = await Promise.all([
      api().post(`/api/v1/meals/${meal.id}/log`).set('Authorization', owner).send(logBody()),
      api().post(`/api/v1/meals/${meal.id}/log`).set('Authorization', owner).send(logBody()),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect([a, b].find((r) => r.status === 409)!.body.code).toBe('MEAL_ALREADY_LOGGED');
    expect(await prisma.mealLog.count({ where: { mealId: meal.id } })).toBe(1);
  });

  it.each([
    ['liking 0', { liking: 0 }],
    ['liking 6', { liking: 6 }],
    ['liking 2.5', { liking: 2.5 }],
    ['unknown amount', { amount: 'lots' }],
    ['time without offset', { loggedAt: '2026-09-24T11:40:00' }],
    ['date only', { loggedAt: '2026-09-24' }],
    ['unknown symptom', { reaction: { symptoms: ['itch'], severity: 'mild' } }],
    [
      'note over 1000',
      { reaction: { symptoms: ['rash'], severity: 'mild', note: 'a'.repeat(1001) } },
    ],
    ['extra field', { extra: true }],
  ])('TC-LOG-003 / X5 refuses %s with 400', async (_label, overrides) => {
    const meal = await lunch();
    await api()
      .post(`/api/v1/meals/${meal.id}/log`)
      .set('Authorization', owner)
      .send(logBody(overrides))
      .expect(400);
  });

  it('TC-LOG-008 a 501-character note is refused by the domain (400 NOTE_TOO_LONG)', async () => {
    const meal = await lunch();
    const res = await api()
      .post(`/api/v1/meals/${meal.id}/log`)
      .set('Authorization', owner)
      .send(logBody({ reaction: { symptoms: ['rash'], severity: 'mild', note: 'a'.repeat(501) } }))
      .expect(400);
    expect(res.body.code).toBe('NOTE_TOO_LONG');
  });

  it('TC-LOG-006 / TC-LOG-007 refuse a time in the future and a severity without symptom (422)', async () => {
    const meal = await lunch();
    const future = await api()
      .post(`/api/v1/meals/${meal.id}/log`)
      .set('Authorization', owner)
      .send(logBody({ loggedAt: '2026-09-24T12:06:00+07:00' }))
      .expect(422);
    expect(future.body.code).toBe('LOGGED_AT_OUT_OF_RANGE');
    const empty = await api()
      .post(`/api/v1/meals/${meal.id}/log`)
      .set('Authorization', owner)
      .send(logBody({ reaction: { symptoms: [], severity: 'severe' } }))
      .expect(422);
    expect(empty.body.code).toBe('REACTION_WITHOUT_SYMPTOM');
  });

  it('refuses tomorrow’s meal (422 MEAL_IN_FUTURE)', async () => {
    const meal = (await day(TOMORROW))[0]!;
    const res = await api()
      .post(`/api/v1/meals/${meal.id}/log`)
      .set('Authorization', owner)
      .send(logBody())
      .expect(422);
    expect(res.body.code).toBe('MEAL_IN_FUTURE');
  });

  it('TC-LOG-014 another family gets 404, and a malformed id 400', async () => {
    const meal = await lunch();
    await api().get(`/api/v1/meals/${meal.id}/log`).set('Authorization', stranger).expect(404);
    await api()
      .post(`/api/v1/meals/${meal.id}/log`)
      .set('Authorization', stranger)
      .send(logBody())
      .expect(404);
    await api().get('/api/v1/meals/not-a-uuid/log').set('Authorization', owner).expect(400);
  });
});

describe('Urgent events and paused foods (UC-10, UC-14)', () => {
  it('TC-URG-001 pauses the meal’s first tries and allergens, then records the medical contact', async () => {
    const meal = await lunch();
    const opened = await api()
      .post(`/api/v1/children/${childId}/urgent-events`)
      .set('Authorization', owner)
      .send({ mealId: meal.id })
      .expect(201);
    expect(opened.body).toMatchObject({
      mealId: meal.id,
      openedAt: NOON.replace('Z', '.000Z'),
      contactedMedicalAt: null,
    });
    expect(opened.body.pausedIngredients.length).toBeGreaterThan(0);

    clock.set('2026-09-24T05:03:00Z');
    const contacted = await api()
      .patch(`/api/v1/urgent-events/${opened.body.id}`)
      .set('Authorization', owner)
      .send({ contactedMedical: true })
      .expect(200);
    expect(contacted.body.contactedMedicalAt).toBe('2026-09-24T05:03:00.000Z');
    await api()
      .patch(`/api/v1/urgent-events/${opened.body.id}`)
      .set('Authorization', stranger)
      .send({ contactedMedical: true })
      .expect(404);
    await api()
      .patch(`/api/v1/urgent-events/${opened.body.id}`)
      .set('Authorization', owner)
      .send({ contactedMedical: false })
      .expect(400);

    const list = await api()
      .get(`/api/v1/children/${childId}/paused-ingredients`)
      .set('Authorization', owner)
      .expect(200);
    expect(list.body[0]).toMatchObject({ reason: 'urgent', meal: { date: TODAY, slot: 'lunch' } });

    const first = list.body[0].ingredientId as string;
    await api()
      .post(`/api/v1/children/${childId}/paused-ingredients/${first}/resume`)
      .set('Authorization', owner)
      .expect(204);
    const again = await api()
      .post(`/api/v1/children/${childId}/paused-ingredients/${first}/resume`)
      .set('Authorization', owner)
      .expect(409);
    expect(again.body.code).toBe('INGREDIENT_NOT_PAUSED');
  });

  it('TC-URG-002 without a meal, nothing is paused; another family’s child is 404', async () => {
    const res = await api()
      .post(`/api/v1/children/${childId}/urgent-events`)
      .set('Authorization', owner)
      .send({})
      .expect(201);
    expect(res.body.pausedIngredients).toEqual([]);
    await api()
      .post(`/api/v1/children/${childId}/urgent-events`)
      .set('Authorization', stranger)
      .send({})
      .expect(404);
    await api()
      .get(`/api/v1/children/${childId}/paused-ingredients`)
      .set('Authorization', stranger)
      .expect(404);
  });
});

describe('GET /children/:id/journal (FR-069)', () => {
  it('lists logs and urgent events newest first, page by page', async () => {
    const meal = await lunch();
    await api()
      .post(`/api/v1/meals/${meal.id}/log`)
      .set('Authorization', owner)
      .send(logBody({ reaction: { symptoms: ['vomit'], severity: 'moderate' } }))
      .expect(201);
    clock.set('2026-09-24T05:10:00Z');
    await api()
      .post(`/api/v1/children/${childId}/urgent-events`)
      .set('Authorization', owner)
      .send({ mealId: meal.id })
      .expect(201);

    const res = await api()
      .get(`/api/v1/children/${childId}/journal`)
      .set('Authorization', owner)
      .expect(200);
    expect(res.body.nextCursor).toBeNull();
    expect(res.body.entries.map((e: { kind: string }) => e.kind)).toEqual(['urgent', 'meal']);
    expect(res.body.entries[0]).toMatchObject({
      date: TODAY,
      slot: 'lunch',
      dish: { id: meal.dish.id },
      amount: null,
      liking: null,
      reaction: null,
      contactedMedicalAt: null,
    });
    expect(res.body.entries[1]).toMatchObject({
      amount: 'half',
      liking: 3,
      reaction: { symptoms: ['vomit'], severity: 'moderate', note: null },
      contactedMedicalAt: null,
    });
    expect(res.body.entries[1].pausedIngredients.length).toBeGreaterThan(0);

    const bad = await api()
      .get(`/api/v1/children/${childId}/journal?cursor=nope`)
      .set('Authorization', owner)
      .expect(400);
    expect(bad.body.code).toBe('INVALID_CURSOR');
    await api()
      .get(`/api/v1/children/${childId}/journal`)
      .set('Authorization', stranger)
      .expect(404);
  });
});

describe('"Món của bạn" (UC-23)', () => {
  const dish = (overrides: Record<string, unknown> = {}) => ({
    name: 'Cháo gà bí đỏ nhà làm',
    mealType: 'main',
    ingredients: [
      { id: 'ing_gao_te' },
      { id: 'ing_thit_ga', qty: 30, unit: 'g' },
      { id: 'ing_bi_do' },
    ],
    prepMin: 10,
    cookMin: 20,
    steps: ['Vo gạo', 'Nấu cháo'],
    ...overrides,
  });

  it('TC-CUS-001 / TC-CUS-009 creates, shows, lists, swaps to, edits and deletes a dish', async () => {
    const created = await api()
      .post(`/api/v1/children/${childId}/custom-dishes`)
      .set('Authorization', owner)
      .send(dish())
      .expect(201);
    const id = created.body.id as string;
    expect(created.body).toMatchObject({
      custom: true,
      reviewedBy: null,
      mealType: 'main',
      foodGroups: ['carb', 'protein', 'veg'],
    });
    expect(created.body.ingredients[1]).toMatchObject({
      name: 'Thịt gà',
      qty: 30,
      unit: 'g',
      isMain: true,
    });

    const recipe = await api()
      .get(`/api/v1/children/${childId}/dishes/${id}`)
      .set('Authorization', owner)
      .expect(200);
    expect(recipe.body.safetyNotes.length).toBe(2);
    const form = await api()
      .get(`/api/v1/children/${childId}/custom-dishes/${id}`)
      .set('Authorization', owner)
      .expect(200);
    expect(form.body.ingredients.map((i: { id: string }) => i.id)).toEqual([
      'ing_gao_te',
      'ing_thit_ga',
      'ing_bi_do',
    ]);

    const library = await api()
      .get(`/api/v1/children/${childId}/dishes?chip=custom`)
      .set('Authorization', owner)
      .expect(200);
    expect(
      library.body.dishes.map((d: { id: string; custom: boolean }) => [d.id, d.custom]),
    ).toEqual([[id, true]]);

    const dinner = (await day()).find((m) => m.slot === 'dinner')!;
    const swapped = await api()
      .post(`/api/v1/meals/${dinner.id}/swap`)
      .set('Authorization', owner)
      .send({ dishId: id, reason: 'other' })
      .expect(200);
    expect(swapped.body.dish).toMatchObject({ id, custom: true });

    await api()
      .put(`/api/v1/children/${childId}/custom-dishes/${id}`)
      .set('Authorization', owner)
      .send(dish({ name: 'Cháo gà nhà làm', cookMin: 25 }))
      .expect(200);

    await api()
      .delete(`/api/v1/children/${childId}/custom-dishes/${id}`)
      .set('Authorization', owner)
      .expect(204);
    const after = (await day()).find((m) => m.slot === 'dinner')!;
    expect(after.dish.id).not.toBe(id);
    await api()
      .delete(`/api/v1/children/${childId}/custom-dishes/${id}`)
      .set('Authorization', owner)
      .expect(404);
  });

  it('TC-CUS-013 a deleted dish still names the meal it was eaten at, here and in the journal', async () => {
    const { body } = await api()
      .post(`/api/v1/children/${childId}/custom-dishes`)
      .set('Authorization', owner)
      .send(dish())
      .expect(201);
    const dinner = (await day()).find((m) => m.slot === 'dinner')!;
    await api()
      .post(`/api/v1/meals/${dinner.id}/swap`)
      .set('Authorization', owner)
      .send({ dishId: body.id, reason: 'other' })
      .expect(200);
    await api()
      .post(`/api/v1/meals/${dinner.id}/log`)
      .set('Authorization', owner)
      .send(logBody({ loggedAt: '2026-09-24T11:55:00+07:00' }))
      .expect(201);
    await api()
      .delete(`/api/v1/children/${childId}/custom-dishes/${body.id}`)
      .set('Authorization', owner)
      .expect(204);

    const eaten = (await day()).find((m) => m.slot === 'dinner')!;
    expect(eaten).toMatchObject({ status: 'eaten', dish: { id: body.id, custom: true } });
    const journal = await api()
      .get(`/api/v1/children/${childId}/journal`)
      .set('Authorization', owner)
      .expect(200);
    expect(journal.body.entries[0].dish).toEqual({
      id: body.id,
      name: 'Cháo gà bí đỏ nhà làm',
      custom: true,
    });
  });

  it('TC-CUS-002 refuses an egg dish for a child avoiding eggs, naming the food', async () => {
    const res = await api()
      .post(`/api/v1/children/${childId}/custom-dishes`)
      .set('Authorization', owner)
      .send(dish({ ingredients: [{ id: 'ing_trung_ga' }, { id: 'ing_mat_ong' }] }))
      .expect(422);
    expect(res.body).toMatchObject({
      code: 'DISH_NOT_SAFE_FOR_CHILD',
      ingredients: [
        { id: 'ing_trung_ga', name: expect.any(String), reason: 'allergen' },
        { id: 'ing_mat_ong', name: expect.any(String), reason: 'age' },
      ],
    });
  });

  it('TC-CUS-003..007 answers precise errors', async () => {
    const post = (body: Record<string, unknown>) =>
      api()
        .post(`/api/v1/children/${childId}/custom-dishes`)
        .set('Authorization', owner)
        .send(body);
    expect((await post(dish({ name: 'A' })).expect(400)).body).toMatchObject({
      code: 'INVALID_CUSTOM_DISH',
      field: 'name',
    });
    expect(
      (await post(dish({ ingredients: [{ id: 'ing_pizza' }] })).expect(422)).body,
    ).toMatchObject({
      code: 'UNKNOWN_INGREDIENT',
      ingredientIds: ['ing_pizza'],
    });
    await post(dish({ mealType: 'dessert' })).expect(400);
    await post(dish({ prepMin: 2.5 })).expect(400);
    await post(dish()).expect(201);
    expect((await post(dish({ name: 'CHAO GA BI DO NHA LAM' })).expect(409)).body.code).toBe(
      'DISH_NAME_TAKEN',
    );
  });

  it('TC-CUS-010 another family cannot see, edit, delete or create for the child', async () => {
    const { body } = await api()
      .post(`/api/v1/children/${childId}/custom-dishes`)
      .set('Authorization', owner)
      .send(dish())
      .expect(201);
    const path = `/api/v1/children/${childId}/custom-dishes/${body.id}`;
    await api().get(path).set('Authorization', stranger).expect(404);
    await api().put(path).set('Authorization', stranger).send(dish()).expect(404);
    await api().delete(path).set('Authorization', stranger).expect(404);
    await api()
      .get(`/api/v1/children/${childId}/dishes/${body.id}`)
      .set('Authorization', stranger)
      .expect(404);
    await api()
      .post(`/api/v1/children/${childId}/custom-dishes`)
      .set('Authorization', stranger)
      .send(dish())
      .expect(404);
  });
});
