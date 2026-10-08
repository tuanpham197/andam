import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import {
  REPO_CATALOG_DIR,
  loadCatalog,
} from '../../src/modules/catalog/adapters/out/files/catalog-files.js';
import { seedCatalog } from '../../src/modules/catalog/adapters/out/persistence/catalog-seeder.js';
import { ChildProfileService } from '../../src/modules/child-profile/application/use-cases/child-profile.service.js';
import {
  CHILD_PLANNING_READER,
  type ChildPlanningReader,
} from '../../src/modules/meal-planning/application/ports/out/child-planning.reader.js';
import {
  FOOD_HISTORY_READER,
  type FoodHistoryReader,
} from '../../src/modules/meal-planning/application/ports/out/food-history.reader.js';
import {
  MEAL_PLAN_REPOSITORY,
  type MealPlanRepository,
} from '../../src/modules/meal-planning/application/ports/out/meal-plan.repository.js';
import {
  PLANNING_CATALOG,
  type PlanningCatalog,
} from '../../src/modules/meal-planning/application/ports/out/planning-catalog.port.js';
import { PlannedMeal } from '../../src/modules/meal-planning/domain/planned-meal.js';
import { MealPlanningModule } from '../../src/modules/meal-planning/meal-planning.module.js';
import { ConfigModule } from '../../src/shared/infrastructure/config/config.module.js';
import { KernelModule } from '../../src/shared/infrastructure/kernel/kernel.module.js';
import { PersistenceModule } from '../../src/shared/infrastructure/persistence/persistence.module.js';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service.js';
import { UNIT_OF_WORK, type UnitOfWork } from '../../src/shared/kernel/unit-of-work.port.js';
import { insertUser, resetDatabase } from '../support/database.js';

let moduleRef: TestingModule;
let prisma: PrismaService;
let plans: MealPlanRepository;
let history: FoodHistoryReader;
let children: ChildPlanningReader;
let catalog: PlanningCatalog;
let uow: UnitOfWork;
let ownerId: string;
let childId: string;

const meal = (overrides: Partial<Parameters<typeof PlannedMeal.restore>[0]> = {}) =>
  PlannedMeal.restore({
    id: randomUUID(),
    childId,
    date: '2026-09-24',
    slot: 'lunch',
    time: '11:00',
    dishId: 'dish_chao_ca_hoi_rau_ngot',
    stageId: 2,
    texture: 'lumpy',
    portionText: '120–150 ml',
    status: 'planned',
    newIngredientIds: ['ing_rau_ngot'],
    source: 'auto',
    generatedAt: new Date('2026-09-24T01:00:00Z'),
    ...overrides,
  });

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    imports: [ConfigModule, KernelModule, PersistenceModule, MealPlanningModule],
  }).compile();
  await moduleRef.init();
  prisma = moduleRef.get(PrismaService);
  plans = moduleRef.get(MEAL_PLAN_REPOSITORY);
  history = moduleRef.get(FOOD_HISTORY_READER);
  children = moduleRef.get(CHILD_PLANNING_READER);
  catalog = moduleRef.get(PLANNING_CATALOG);
  uow = moduleRef.get(UNIT_OF_WORK, { strict: false });
  await resetDatabase(prisma);
  await seedCatalog(prisma, await loadCatalog(REPO_CATALOG_DIR));
});

beforeEach(async () => {
  await prisma.child.deleteMany();
  await prisma.user.deleteMany();
  ownerId = (await insertUser(prisma)).id;
  childId = randomUUID();
  await prisma.child.create({
    data: {
      id: childId,
      userId: ownerId,
      name: 'Na',
      birthDate: new Date('2026-01-12'),
      priorReaction: 'never',
      members: { create: { userId: ownerId, role: 'owner', joinedAt: new Date() } },
    },
  });
});

afterAll(() => moduleRef.close());

describe('PrismaMealPlanRepository', () => {
  it('stores meals and reads them back by date range in time order', async () => {
    const dinner = meal({ slot: 'dinner', time: '18:00', newIngredientIds: [] });
    const lunch = meal();
    expect(await plans.addMany([dinner, lunch])).toBe(true);
    const found = await plans.findBetween(childId, '2026-09-24', '2026-09-24');
    expect(found.map((m) => m.slot)).toEqual(['lunch', 'dinner']);
    expect(found[0]).toMatchObject({
      date: '2026-09-24',
      texture: 'lumpy',
      newIngredientIds: ['ing_rau_ngot'],
      source: 'auto',
    });
    expect(await plans.findBetween(childId, '2026-09-25', '2026-09-30')).toEqual([]);
  });

  it('TC-PLN-001 refuses a second plan for the same slot and stores nothing of that batch', async () => {
    await plans.addMany([meal()]);
    expect(await plans.addMany([meal({ slot: 'dinner', time: '18:00' }), meal()])).toBe(false);
    expect(await plans.findBetween(childId, '2026-09-24', '2026-09-24')).toHaveLength(1);
  });

  it('TC-PLN-001 absorbs a slot conflict inside a unit of work, which still commits', async () => {
    await plans.addMany([meal()]);
    await uow.run(async () => {
      expect(await plans.addMany([meal({ slot: 'dinner', time: '18:00' }), meal()])).toBe(false);
      // Without a savepoint Postgres would refuse this: "current transaction is aborted".
      expect(await plans.addMany([meal({ slot: 'dinner', time: '18:00' })])).toBe(true);
    });
    expect(await plans.findBetween(childId, '2026-09-24', '2026-09-24')).toHaveLength(2);
  });

  it('surfaces database errors other than a slot conflict (meal for a deleted child)', async () => {
    await expect(plans.addMany([meal({ childId: randomUUID() })])).rejects.toMatchObject({
      code: 'P2003',
    });
  });

  it('accepts an empty batch', async () => {
    expect(await plans.addMany([])).toBe(true);
  });

  it('finds a meal only for the owner of the child', async () => {
    const m = meal();
    await plans.addMany([m]);
    expect((await plans.findOwned(m.id, ownerId))?.id).toBe(m.id);
    const stranger = (await insertUser(prisma)).id;
    expect(await plans.findOwned(m.id, stranger)).toBeNull();
    expect(await plans.findOwned(randomUUID(), ownerId)).toBeNull();
  });

  it('saves a status change and removes meals', async () => {
    const m = meal();
    await plans.addMany([m]);
    m.markPrepared();
    await plans.save(m);
    expect((await plans.findOwned(m.id, ownerId))!.status).toBe('prepared');
    await plans.remove([m.id]);
    expect(await plans.findOwned(m.id, ownerId)).toBeNull();
    await expect(plans.remove([])).resolves.toBeUndefined();
  });

  it('stores a swap with the new dish and keeps its history', async () => {
    const m = meal();
    await plans.addMany([m]);
    m.swapTo({
      dishId: 'dish_chao_bo_bi_do',
      texture: 'lumpy',
      portionText: '120–150 ml tham khảo',
      newIngredientIds: ['ing_thit_bo'],
    });
    expect(await plans.saveSwap(m, 'dish_chao_ca_hoi_rau_ngot')).toBe(true);
    // A second swap from the old dish (a concurrent request) finds the meal already changed.
    expect(await plans.saveSwap(m, 'dish_chao_ca_hoi_rau_ngot')).toBe(false);
    await plans.recordSwap({
      id: randomUUID(),
      mealId: m.id,
      fromDishId: 'dish_chao_ca_hoi_rau_ngot',
      toDishId: 'dish_chao_bo_bi_do',
      reason: 'faster',
      createdAt: new Date('2026-09-24T02:00:00Z'),
      actorId: ownerId,
    });
    expect(await plans.findOwned(m.id, ownerId)).toMatchObject({
      dishId: 'dish_chao_bo_bi_do',
      source: 'swap',
      newIngredientIds: ['ing_thit_bo'],
    });
    expect(await prisma.swapEvent.findMany({ where: { mealId: m.id } })).toEqual([
      expect.objectContaining({
        fromDishId: 'dish_chao_ca_hoi_rau_ngot',
        toDishId: 'dish_chao_bo_bi_do',
        reason: 'faster',
      }),
    ]);
  });
});

describe('PrismaFoodHistoryReader', () => {
  async function addLog(
    dishId: string,
    liking: number,
    amount: 'half' | 'all',
    loggedAt: string,
    slot: 'lunch' | 'dinner',
  ) {
    const m = meal({ dishId, slot, date: loggedAt.slice(0, 10) });
    await plans.addMany([m]);
    await prisma.mealLog.create({
      data: {
        id: randomUUID(),
        mealId: m.id,
        childId,
        dishId,
        loggedAt: new Date(loggedAt),
        amount,
        liking,
      },
    });
  }

  it('reads foods eaten without reaction as tried', async () => {
    await prisma.ingredientExposure.createMany({
      data: [
        { childId, ingredientId: 'ing_ca_hoi', status: 'tried' },
        { childId, ingredientId: 'ing_rau_ngot', status: 'paused' },
        { childId, ingredientId: 'ing_tom', status: 'new' },
      ],
    });
    expect(await history.tried(childId)).toEqual(new Set(['ing_ca_hoi']));
  });

  it('reads only active pauses', async () => {
    await prisma.pausedIngredient.createMany({
      data: [
        {
          id: randomUUID(),
          childId,
          ingredientId: 'ing_rau_ngot',
          reason: 'reaction',
          pausedAt: new Date(),
        },
        {
          id: randomUUID(),
          childId,
          ingredientId: 'ing_ca_hoi',
          reason: 'urgent',
          pausedAt: new Date(),
          resumedAt: new Date(),
        },
      ],
    });
    expect(await history.paused(childId)).toEqual(new Set(['ing_rau_ngot']));
  });

  it('keeps the latest feedback per dish, dated in Vietnam time', async () => {
    await addLog('dish_chao_ga_bi_do', 1, 'half', '2026-09-20T05:00:00Z', 'lunch');
    await addLog('dish_chao_ga_bi_do', 5, 'all', '2026-09-22T17:30:00Z', 'dinner');
    const feedback = await history.feedback(childId);
    expect(feedback.get('dish_chao_ga_bi_do')).toEqual({
      liking: 5,
      amount: 'all',
      date: '2026-09-23',
    });
  });

  it('dates the introductions of allergenic foods within a range', async () => {
    await prisma.ingredientExposure.createMany({
      data: [
        {
          childId,
          ingredientId: 'ing_ca_hoi',
          status: 'tried',
          firstTriedAt: new Date('2026-09-22T04:00:00Z'),
        },
        {
          childId,
          ingredientId: 'ing_rau_ngot',
          status: 'tried',
          firstTriedAt: new Date('2026-09-23T04:00:00Z'),
        },
        {
          childId,
          ingredientId: 'ing_tom',
          status: 'tried',
          firstTriedAt: new Date('2026-09-01T04:00:00Z'),
        },
      ],
    });
    expect(await history.allergenIntroductions(childId, '2026-09-21', '2026-09-24')).toEqual([
      '2026-09-22',
    ]);
  });

  describe('health', () => {
    async function episode(
      status: 'sick' | 'recovering',
      start: string,
      end: string | null,
      ended = false,
    ) {
      await prisma.healthEpisode.create({
        data: {
          id: randomUUID(),
          childId,
          status,
          startDate: new Date(start),
          expectedEndDate: end ? new Date(end) : null,
          endedAt: ended ? new Date() : null,
          createdAt: new Date(`${start}T01:00:00Z`),
        },
      });
    }

    it('is normal without any episode', async () => {
      expect(await history.health(childId, '2026-09-24')).toBe('normal');
    });

    it('follows the latest open episode, through the child-health module', async () => {
      await episode('sick', '2026-09-20', null);
      await episode('recovering', '2026-09-23', '2026-09-26');
      expect(await history.health(childId, '2026-09-24')).toBe('recovering');
      // The newer episode supersedes the older one, even for its days.
      expect(await history.health(childId, '2026-09-21')).toBe('normal');
    });

    it('is normal after the expected end, after the episode ended, and before it starts', async () => {
      await episode('sick', '2026-09-20', '2026-09-22');
      expect(await history.health(childId, '2026-09-23')).toBe('normal');
      expect(await history.health(childId, '2026-09-19')).toBe('normal');
      await prisma.healthEpisode.deleteMany();
      await episode('sick', '2026-09-20', null, true);
      expect(await history.health(childId, '2026-09-24')).toBe('normal');
    });
  });
});

describe('cross-module adapters', () => {
  it('reads the planning view of a child through the child-profile module', async () => {
    const service = moduleRef.get(ChildProfileService);
    const created = await service.create(ownerId, {
      name: 'Bin',
      birthDate: '2025-12-01',
      isPremature: false,
      weeksEarly: 0,
      priorReaction: 'never',
      priorReactionNote: null,
      avoidAllergens: ['egg'],
      avoidIngredients: [{ ingredientId: 'ing_tom', reason: 'not_eat' }],
    });
    const info = await children.find(created.id, ownerId);
    expect(info).toMatchObject({
      childId: created.id,
      stage: created.effectiveStage,
      ageMonths: created.age.months,
      avoidAllergens: ['egg'],
      avoidIngredients: ['ing_tom'],
    });
    expect(await children.find(created.id, (await insertUser(prisma)).id)).toBeNull();
  });

  it('reads dishes, ingredients, schedules and recipes through the catalog module', async () => {
    const dishes = await catalog.dishes();
    expect(dishes.find((d) => d.id === 'dish_le_hap_nghien')).toMatchObject({
      mealType: 'snack',
      mainProtein: null,
      stages: [1, 2, 3],
    });
    expect((await catalog.ingredients()).find((i) => i.id === 'ing_ca_hoi')).toMatchObject({
      allergenTags: ['fish'],
      proteinSource: 'fish',
    });
    expect((await catalog.schedule(1)).schedule).toHaveLength(2);
    const recipe = await catalog.recipe('dish_chao_ca_hoi_rau_ngot');
    expect(recipe).toMatchObject({
      dish: { id: 'dish_chao_ca_hoi_rau_ngot', stages: [1, 2, 3] },
      tool: 'Nồi',
    });
    expect(recipe!.variants[1]).toEqual({
      stage: 2,
      texture: 'lumpy',
      portionText: '120–150 ml tham khảo',
      portionMl: 135,
    });
    expect(await catalog.recipe('dish_khong_co')).toBeNull();
  });
});
