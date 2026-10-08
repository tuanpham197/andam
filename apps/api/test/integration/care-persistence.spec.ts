import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import {
  REPO_CATALOG_DIR,
  loadCatalog,
} from '../../src/modules/catalog/adapters/out/files/catalog-files.js';
import { seedCatalog } from '../../src/modules/catalog/adapters/out/persistence/catalog-seeder.js';
import {
  CATALOG_READER,
  type CatalogReader,
} from '../../src/modules/catalog/application/ports/out/catalog.reader.js';
import {
  JOURNAL_READER,
  type JournalReader,
} from '../../src/modules/meal-log/application/ports/out/journal.reader.js';
import {
  MEAL_LOG_REPOSITORY,
  type MealLogRepository,
} from '../../src/modules/meal-log/application/ports/out/meal-log.repository.js';
import { MealLoggedTwiceError } from '../../src/modules/meal-log/domain/errors.js';
import { MealLog } from '../../src/modules/meal-log/domain/meal-log.js';
import { MealLogModule } from '../../src/modules/meal-log/meal-log.module.js';
import {
  CUSTOM_DISH_REPOSITORY,
  type CustomDishRepository,
} from '../../src/modules/meal-planning/application/ports/out/custom-dish.repository.js';
import {
  FOOD_HISTORY_READER,
  type FoodHistoryReader,
} from '../../src/modules/meal-planning/application/ports/out/food-history.reader.js';
import type { CustomDish } from '../../src/modules/meal-planning/domain/custom-dish.js';
import {
  PAUSED_INGREDIENT_REPOSITORY,
  type PausedIngredientRepository,
} from '../../src/modules/safety/application/ports/out/paused-ingredient.repository.js';
import {
  URGENT_EVENT_REPOSITORY,
  type UrgentEventRepository,
} from '../../src/modules/safety/application/ports/out/urgent-event.repository.js';
import { UrgentEvent } from '../../src/modules/safety/domain/urgent-event.js';
import { ConfigModule } from '../../src/shared/infrastructure/config/config.module.js';
import { KernelModule } from '../../src/shared/infrastructure/kernel/kernel.module.js';
import { PersistenceModule } from '../../src/shared/infrastructure/persistence/persistence.module.js';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service.js';
import { UNIT_OF_WORK, type UnitOfWork } from '../../src/shared/kernel/unit-of-work.port.js';
import { insertUser, resetDatabase } from '../support/database.js';

let moduleRef: TestingModule;
let prisma: PrismaService;
let customs: CustomDishRepository;
let catalog: CatalogReader;
let logs: MealLogRepository;
let journal: JournalReader;
let pauses: PausedIngredientRepository;
let urgents: UrgentEventRepository;
let history: FoodHistoryReader;
let uow: UnitOfWork;
let userId: string;
let childId: string;

const get = <T>(token: unknown) => moduleRef.get<T>(token as never, { strict: false });

async function newChild(owner: string) {
  const id = randomUUID();
  await prisma.child.create({
    data: {
      id,
      userId: owner,
      name: 'Na',
      birthDate: new Date('2026-01-12'),
      priorReaction: 'never',
      members: { create: { userId: owner, role: 'owner', joinedAt: new Date() } },
    },
  });
  return id;
}

async function plannedMeal(
  overrides: { date?: string; slot?: 'lunch' | 'dinner'; dishId?: string } = {},
) {
  const id = randomUUID();
  await prisma.plannedMeal.create({
    data: {
      id,
      childId,
      date: new Date(`${overrides.date ?? '2026-09-24'}T00:00:00Z`),
      slot: overrides.slot ?? 'lunch',
      time: '11:00',
      dishId: overrides.dishId ?? 'dish_chao_ca_hoi_rau_ngot',
      stageId: 2,
      texture: 'lumpy',
      portionText: '120–150 ml',
      newIngredientIds: [],
      source: 'auto',
      generatedAt: new Date(),
    },
  });
  return id;
}

const customDish = (overrides: Partial<CustomDish> = {}): CustomDish => ({
  id: `custom_${randomUUID()}`,
  childId,
  name: 'Cháo gà bí đỏ nhà làm',
  nameKey: 'chao ga bi do nha lam',
  mealType: 'main',
  lines: [
    { ingredientId: 'ing_gao_te', qty: null, unit: null, isMain: false },
    { ingredientId: 'ing_ca_hoi', qty: 25.5, unit: 'g', isMain: true },
    { ingredientId: 'ing_rau_ngot', qty: null, unit: null, isMain: false },
  ],
  mainProtein: 'fish',
  prepMin: 10,
  cookMin: 20,
  steps: ['Vo gạo', 'Nấu cháo'],
  archivedAt: null,
  ...overrides,
});

const log = (mealId: string, overrides: Partial<Parameters<typeof MealLog.restore>[0]> = {}) =>
  MealLog.restore({
    id: randomUUID(),
    mealId,
    childId,
    dishId: 'dish_chao_ca_hoi_rau_ngot',
    loggedAt: new Date('2026-09-24T04:40:00Z'),
    amount: 'half',
    liking: 3,
    reaction: null,
    actorId: userId,
    ...overrides,
  });

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    imports: [ConfigModule, KernelModule, PersistenceModule, MealLogModule],
  }).compile();
  await moduleRef.init();
  prisma = moduleRef.get(PrismaService);
  customs = get(CUSTOM_DISH_REPOSITORY);
  catalog = get(CATALOG_READER);
  logs = get(MEAL_LOG_REPOSITORY);
  journal = get(JOURNAL_READER);
  pauses = get(PAUSED_INGREDIENT_REPOSITORY);
  urgents = get(URGENT_EVENT_REPOSITORY);
  history = get(FOOD_HISTORY_READER);
  uow = get(UNIT_OF_WORK);
  await resetDatabase(prisma);
  await seedCatalog(prisma, await loadCatalog(REPO_CATALOG_DIR));
});

beforeEach(async () => {
  await prisma.child.deleteMany();
  await prisma.user.deleteMany();
  userId = (await insertUser(prisma)).id;
  childId = await newChild(userId);
});

afterAll(() => moduleRef.close());

describe('PrismaCustomDishRepository (F18)', () => {
  it('stores a dish with its foods in the order given, quantities optional', async () => {
    const dish = customDish();
    await customs.create(dish, userId);
    expect(await customs.listForChild(childId)).toEqual([dish]);
    expect(await prisma.dish.findUnique({ where: { id: dish.id } })).toMatchObject({
      ownerChildId: childId,
      createdBy: userId,
      reviewedBy: null,
    });
  });

  it('lists only the dishes of that child, deleted ones flagged by their date', async () => {
    const mine = customDish();
    await customs.create(mine, userId);
    await customs.create(customDish({ childId: await newChild(userId) }), userId);
    const at = new Date('2026-09-24T05:00:00Z');
    await customs.archive(mine.id, at);
    expect(await customs.listForChild(childId)).toEqual([{ ...mine, archivedAt: at }]);
  });

  it('replaces the foods on update', async () => {
    const dish = customDish();
    await customs.create(dish, userId);
    const edited = customDish({
      id: dish.id,
      name: 'Cháo cá',
      nameKey: 'chao ca',
      lines: [{ ingredientId: 'ing_ca_hoi', qty: 30, unit: 'g', isMain: true }],
      steps: [],
    });
    await customs.update(edited);
    expect(await customs.listForChild(childId)).toEqual([edited]);
  });

  it('TC-CUS-015 stays out of the catalog API and survives seeding the catalog again', async () => {
    const dish = customDish();
    await customs.create(dish, userId);
    expect((await catalog.listDishes()).map((d) => d.id)).not.toContain(dish.id);
    expect(await catalog.recipe(dish.id)).toBeNull();
    await seedCatalog(prisma, await loadCatalog(REPO_CATALOG_DIR));
    expect(await customs.listForChild(childId)).toEqual([dish]);
  });

  it('goes away with the child (ON DELETE CASCADE), even when meals use it', async () => {
    const dish = customDish();
    await customs.create(dish, userId);
    await plannedMeal({ dishId: dish.id });
    await prisma.child.delete({ where: { id: childId } });
    expect(await prisma.dish.count({ where: { ownerChildId: { not: null } } })).toBe(0);
  });
});

describe('PrismaMealLogRepository', () => {
  it('stores a log with its reaction and reads it back', async () => {
    const mealId = await plannedMeal();
    const stored = log(mealId, {
      reaction: { symptoms: ['rash', 'fussy'], severity: 'mild', note: 'Nổi mẩn' },
    });
    await logs.add(stored);
    expect(await logs.findByMeal(mealId)).toEqual(stored);
    expect(await logs.findByMeal(randomUUID())).toBeNull();
  });

  it('FR-118 tells who logged a meal: display name, e-mail name, or nobody after deletion', async () => {
    const mealId = await plannedMeal();
    await logs.add(log(mealId));
    const email = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).email;
    expect(await logs.whoLogged(mealId)).toEqual({
      name: email.split('@')[0],
      at: new Date('2026-09-24T04:40:00Z'),
    });
    await prisma.user.update({ where: { id: userId }, data: { displayName: 'Ba' } });
    expect((await logs.whoLogged(mealId))!.name).toBe('Ba');
    expect(await history.loggedBy([mealId, randomUUID()])).toEqual(
      new Map([[mealId, { name: 'Ba', at: new Date('2026-09-24T04:40:00Z') }]]),
    );
    expect(await history.loggedBy([])).toEqual(new Map());
    expect((await journal.page(childId, null, 5))[0]).toMatchObject({ actorName: 'Ba' });
    await prisma.mealLog.update({ where: { mealId }, data: { actorId: null } });
    expect((await logs.whoLogged(mealId))!.name).toBeNull();
    expect(await logs.whoLogged(randomUUID())).toBeNull();
  });

  it('stores a log without a reaction', async () => {
    const mealId = await plannedMeal();
    await logs.add(log(mealId));
    expect((await logs.findByMeal(mealId))!.reaction).toBeNull();
  });

  it('TC-LOG-005 a second log of the meal fails as MEAL_ALREADY_LOGGED', async () => {
    const mealId = await plannedMeal();
    await logs.add(log(mealId));
    await expect(logs.add(log(mealId))).rejects.toThrow(MealLoggedTwiceError);
  });

  it('surfaces other database errors (log for a meal that does not exist)', async () => {
    await expect(logs.add(log(randomUUID()))).rejects.toMatchObject({ code: 'P2003' });
  });

  it('BR-44 keeps the first and last time eaten, and "tried" once tried', async () => {
    const at = (h: number) => new Date(Date.UTC(2026, 8, 24, h));
    await logs.recordExposures(childId, [
      { ingredientId: 'ing_rau_ngot', at: at(5), tried: false },
      { ingredientId: 'ing_ca_hoi', at: at(5), tried: true },
    ]);
    await logs.recordExposures(childId, [
      { ingredientId: 'ing_rau_ngot', at: at(3), tried: true },
      { ingredientId: 'ing_ca_hoi', at: at(9), tried: false },
    ]);
    const rows = await prisma.ingredientExposure.findMany({ orderBy: { ingredientId: 'asc' } });
    expect(rows.map((r) => [r.ingredientId, r.firstTriedAt, r.lastEatenAt, r.status])).toEqual([
      ['ing_ca_hoi', at(5), at(9), 'tried'],
      ['ing_rau_ngot', at(3), at(5), 'tried'],
    ]);
    expect(await history.tried(childId)).toEqual(new Set(['ing_ca_hoi', 'ing_rau_ngot']));
  });

  it('BR-44 an exposure with a reaction stays "new"', async () => {
    await logs.recordExposures(childId, [
      { ingredientId: 'ing_rau_ngot', at: new Date(), tried: false },
    ]);
    await logs.recordExposures(childId, [
      { ingredientId: 'ing_rau_ngot', at: new Date(), tried: false },
    ]);
    expect(await history.tried(childId)).toEqual(new Set());
  });
});

describe('PrismaPausedIngredientRepository / PrismaUrgentEventRepository', () => {
  const pause = (ingredientId: string, extra: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    childId,
    ingredientId,
    reason: 'reaction' as const,
    sourceLogId: null,
    sourceUrgentId: null,
    pausedAt: new Date('2026-09-24T05:00:00Z'),
    ...extra,
  });

  it('lists active pauses with the meal behind them, newest first', async () => {
    const mealId = await plannedMeal();
    const logged = log(mealId);
    await logs.add(logged);
    const event = UrgentEvent.open({
      id: randomUUID(),
      childId,
      mealId,
      openedAt: new Date('2026-09-24T06:00:00Z'),
      actorId: userId,
    });
    await urgents.add(event);
    await pauses.add([
      pause('ing_rau_ngot', { sourceLogId: logged.id }),
      pause('ing_ca_hoi', {
        reason: 'urgent',
        sourceUrgentId: event.id,
        pausedAt: new Date('2026-09-24T06:00:00Z'),
      }),
      pause('ing_gao_te', { pausedAt: new Date('2026-09-23T06:00:00Z') }),
    ]);
    const meal = { date: '2026-09-24', slot: 'lunch', dishName: 'Cháo cá hồi rau ngót' };
    expect(
      (await pauses.listActive(childId)).map((p) => [p.ingredientId, p.reason, p.meal]),
    ).toEqual([
      ['ing_ca_hoi', 'urgent', meal],
      ['ing_rau_ngot', 'reaction', meal],
      ['ing_gao_te', 'reaction', null],
    ]);
    expect((await pauses.listActive(childId))[1]!.name).toBe('Rau ngót');
  });

  it('TC-LOG-012 / TC-RES-003 one active pause per food; resumed, it can be paused again', async () => {
    await pauses.add([pause('ing_rau_ngot')]);
    await expect(pauses.add([pause('ing_rau_ngot')])).rejects.toMatchObject({ code: 'P2002' });
    expect(await pauses.resume(childId, 'ing_rau_ngot', new Date(), userId)).toBe(true);
    expect(await pauses.resume(childId, 'ing_rau_ngot', new Date(), userId)).toBe(false);
    await pauses.add([pause('ing_rau_ngot')]);
    expect(await pauses.activeIds(childId)).toEqual(new Set(['ing_rau_ngot']));
    expect(await prisma.pausedIngredient.count()).toBe(2);
  });

  it('a pause made inside a unit of work is visible to the planner in that same work', async () => {
    await uow.run(async () => {
      await pauses.add([pause('ing_rau_ngot')]);
      expect(await history.paused(childId)).toEqual(new Set(['ing_rau_ngot']));
    });
  });

  it('stores, finds and updates an urgent event', async () => {
    const event = UrgentEvent.open({
      id: randomUUID(),
      childId,
      mealId: null,
      openedAt: new Date('2026-09-24T06:00:00Z'),
      actorId: userId,
    });
    await urgents.add(event);
    event.markContactedMedical(new Date('2026-09-24T06:05:00Z'));
    await urgents.save(event);
    expect(await urgents.find(event.id)).toEqual(event);
    expect(await urgents.find(randomUUID())).toBeNull();
  });
});

describe('PrismaJournalReader (G02)', () => {
  it('tells whether the user owns the child', async () => {
    expect(await journal.ownsChild(userId, childId)).toBe(true);
    expect(await journal.ownsChild((await insertUser(prisma)).id, childId)).toBe(false);
  });

  it('merges logs and urgent events newest first, then pages with a cursor', async () => {
    const own = customDish();
    await customs.create(own, userId);
    const lunch = await plannedMeal();
    const dinner = await plannedMeal({ slot: 'dinner', dishId: own.id });
    const at = (m: number) => new Date(Date.UTC(2026, 8, 24, 5, m));
    const lunchLog = log(lunch, {
      loggedAt: at(10),
      reaction: { symptoms: ['rash'], severity: 'mild', note: null },
    });
    await logs.add(lunchLog);
    await logs.add(log(dinner, { dishId: own.id, loggedAt: at(30) }));
    const urgent = UrgentEvent.open({
      id: randomUUID(),
      childId,
      mealId: lunch,
      openedAt: at(20),
      actorId: userId,
    });
    await urgents.add(urgent);
    await urgents.add(
      UrgentEvent.open({
        id: randomUUID(),
        childId,
        mealId: null,
        openedAt: at(5),
        actorId: userId,
      }),
    );
    await pauses.add([
      {
        id: randomUUID(),
        childId,
        ingredientId: 'ing_rau_ngot',
        reason: 'reaction',
        sourceLogId: lunchLog.id,
        sourceUrgentId: null,
        pausedAt: at(10),
      },
    ]);

    const all = await journal.page(childId, null, 10);
    expect(all.map((e) => [e.kind, e.at])).toEqual([
      ['meal', at(30)],
      ['urgent', at(20)],
      ['meal', at(10)],
      ['urgent', at(5)],
    ]);
    expect(all[0]).toMatchObject({
      dish: { id: own.id, custom: true },
      slot: 'dinner',
      date: '2026-09-24',
    });
    expect(all[1]).toMatchObject({
      meal: { slot: 'lunch', dish: { name: 'Cháo cá hồi rau ngót', custom: false } },
      contactedMedicalAt: null,
    });
    expect(all[2]).toMatchObject({
      reaction: { symptoms: ['rash'], severity: 'mild', note: null },
      pausedIngredients: [{ id: 'ing_rau_ngot', name: 'Rau ngót' }],
    });
    expect(all[3]).toMatchObject({ meal: null });

    const page = await journal.page(childId, null, 2);
    expect(page.map((e) => e.at)).toEqual([at(30), at(20)]);
    const next = await journal.page(childId, { at: page[1]!.at, id: page[1]!.id }, 2);
    expect(next.map((e) => e.at)).toEqual([at(10), at(5)]);
  });

  it('breaks ties on the same instant by id, so no entry is skipped or repeated', async () => {
    const at = new Date('2026-09-24T05:00:00Z');
    const ids = [randomUUID(), randomUUID(), randomUUID()].sort().reverse();
    for (const id of ids) {
      await urgents.add(
        UrgentEvent.open({ id, childId, mealId: null, openedAt: at, actorId: userId }),
      );
    }
    const first = await journal.page(childId, null, 2);
    const rest = await journal.page(childId, { at, id: first[1]!.id }, 2);
    expect([...first, ...rest].map((e) => e.id)).toEqual(ids);
  });

  it('is empty for a child with nothing logged', async () => {
    expect(await journal.page(childId, null, 5)).toEqual([]);
  });
});
