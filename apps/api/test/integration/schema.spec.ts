import { randomUUID } from 'node:crypto';
import { createTestPrisma, insertUser, resetDatabase } from '../support/database.js';

const prisma = createTestPrisma();

beforeEach(() => resetDatabase(prisma));
afterAll(() => prisma.onModuleDestroy());

async function seedChildWithMeal() {
  const user = await insertUser(prisma);
  const child = await prisma.child.create({
    data: {
      id: randomUUID(),
      userId: user.id,
      name: 'Na',
      birthDate: new Date('2026-01-12'),
      priorReaction: 'never',
    },
  });
  await prisma.stage.create({
    data: {
      id: 2,
      name: 'Giai đoạn 2',
      ageFromMonths: 8,
      ageToMonths: 10,
      texture: 'lumpy',
      portionText: 'Khoảng 125 ml',
      mainMeals: 3,
      snacksMin: 1,
      snacksMax: 1,
      defaultSchedule: [],
    },
  });
  const ingredient = await prisma.ingredient.create({
    data: {
      id: 'ing_rau_ngot',
      name: 'Rau ngót',
      searchText: 'rau ngot',
      foodGroup: 'veg',
      minAgeMonths: 6,
    },
  });
  const dish = await prisma.dish.create({
    data: {
      id: 'dish_chao',
      name: 'Cháo cá hồi rau ngót',
      description: '',
      mealType: 'main',
      prepMin: 10,
      cookMin: 15,
      tool: 'Nồi',
      steps: [],
      contentVersion: 1,
      status: 'published',
      searchText: 'chao ca hoi rau ngot',
    },
  });
  const meal = await prisma.plannedMeal.create({
    data: {
      id: randomUUID(),
      childId: child.id,
      date: new Date('2026-09-24'),
      slot: 'lunch',
      time: '11:00',
      dishId: dish.id,
      stageId: 2,
      texture: 'lumpy',
      portionText: 'Khoảng 125 ml',
      source: 'auto',
      generatedAt: new Date(),
    },
  });
  return { user, child, ingredient, dish, meal };
}

async function expectRejected(promise: Promise<unknown>, pattern: RegExp) {
  await expect(promise).rejects.toThrow(pattern);
}

describe('database schema (TC-DB-001, TC-DB-003)', () => {
  it('enables pg_trgm for accent-insensitive search', async () => {
    const rows = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`;
    expect(rows).toHaveLength(1);
  });

  it('indexes ingredient and dish search text with trigrams', async () => {
    const rows = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE indexname IN ('ingredients_search_text_trgm_idx', 'dishes_search_text_trgm_idx')`;
    expect(rows.map((r) => r.indexname).sort()).toEqual([
      'dishes_search_text_trgm_idx',
      'ingredients_search_text_trgm_idx',
    ]);
  });

  it('stores emails case-insensitively unique', async () => {
    await insertUser(prisma, 'na@example.vn');
    await expectRejected(insertUser(prisma, 'NA@example.vn'), /Unique constraint/);
  });

  describe('CHECK constraints guard values even if validation is bypassed', () => {
    it.each([0, 6])('rejects liking = %i', async (liking) => {
      const { child, dish, meal } = await seedChildWithMeal();
      await expectRejected(
        prisma.mealLog.create({
          data: {
            id: randomUUID(),
            mealId: meal.id,
            childId: child.id,
            dishId: dish.id,
            loggedAt: new Date(),
            amount: 'half',
            liking,
          },
        }),
        /meal_logs_liking_check/,
      );
    });

    it('accepts liking at both ends of the scale', async () => {
      const { child, dish, meal } = await seedChildWithMeal();
      await expect(
        prisma.mealLog.create({
          data: {
            id: randomUUID(),
            mealId: meal.id,
            childId: child.id,
            dishId: dish.id,
            loggedAt: new Date(),
            amount: 'half',
            liking: 5,
          },
        }),
      ).resolves.toBeDefined();
    });

    it.each([-1, 17])('rejects weeks_early = %i', async (weeksEarly) => {
      const user = await insertUser(prisma);
      await expectRejected(
        prisma.child.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            name: 'Na',
            birthDate: new Date('2026-01-12'),
            priorReaction: 'never',
            weeksEarly,
          },
        }),
        /children_weeks_early_check/,
      );
    });

    it.each([0, 5])('rejects stage_override = %i', async (stageOverride) => {
      const user = await insertUser(prisma);
      await expectRejected(
        prisma.child.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            name: 'Na',
            birthDate: new Date('2026-01-12'),
            priorReaction: 'never',
            stageOverride,
          },
        }),
        /children_stage_override_check/,
      );
    });

    it.each(['25:00', '7:30', '07-30'])('rejects meal time %s', async (time) => {
      const { meal } = await seedChildWithMeal();
      await expectRejected(
        prisma.plannedMeal.update({ where: { id: meal.id }, data: { time } }),
        /planned_meals_time_check/,
      );
    });

    it('rejects a blank child name', async () => {
      const user = await insertUser(prisma);
      await expectRejected(
        prisma.child.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            name: '   ',
            birthDate: new Date('2026-01-12'),
            priorReaction: 'never',
          },
        }),
        /children_name_check/,
      );
    });
  });

  describe('paused ingredients: one active pause per child and ingredient', () => {
    async function pause(childId: string, resumedAt: Date | null = null) {
      return prisma.pausedIngredient.create({
        data: {
          id: randomUUID(),
          childId,
          ingredientId: 'ing_rau_ngot',
          reason: 'reaction',
          pausedAt: new Date(),
          resumedAt,
        },
      });
    }

    it('rejects a second active pause (TC-LOG-012)', async () => {
      const { child } = await seedChildWithMeal();
      await pause(child.id);
      await expectRejected(pause(child.id), /Unique constraint/);
    });

    it('allows pausing again after the previous pause was resumed (TC-RES-003)', async () => {
      const { child } = await seedChildWithMeal();
      await pause(child.id, new Date());
      await expect(pause(child.id)).resolves.toBeDefined();
    });
  });

  it('deleting a child cascades to its plans and logs, but not to other children (TC-CHD-015)', async () => {
    const { child, dish, meal } = await seedChildWithMeal();
    await prisma.mealLog.create({
      data: {
        id: randomUUID(),
        mealId: meal.id,
        childId: child.id,
        dishId: dish.id,
        loggedAt: new Date(),
        amount: 'half',
        liking: 3,
      },
    });
    const other = await prisma.child.create({
      data: {
        id: randomUUID(),
        userId: child.userId,
        name: 'Bin',
        birthDate: new Date('2026-02-01'),
        priorReaction: 'never',
      },
    });

    await prisma.child.delete({ where: { id: child.id } });

    expect(await prisma.plannedMeal.count()).toBe(0);
    expect(await prisma.mealLog.count()).toBe(0);
    expect(await prisma.child.findUnique({ where: { id: other.id } })).not.toBeNull();
  });
});
