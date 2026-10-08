import { CHILD, USER, planningTestbed, snapshot } from '../../../../../test/fakes/meal-planning.js';
import type { CustomDishInput } from '../../domain/custom-dish.js';
import {
  CustomDishLimitError,
  CustomDishNotSafeError,
  DishNameTakenError,
  DishNotFoundError,
  InvalidCustomDishError,
  PlanChildNotFoundError,
  UnknownDishIngredientError,
} from '../../domain/errors.js';
import { PlannedMeal } from '../../domain/planned-meal.js';
import { CUSTOM_SAFETY_NOTES } from './planning-dishes.js';

const TODAY = '2026-09-24';

const input = (overrides: Partial<CustomDishInput> = {}): CustomDishInput => ({
  name: 'Cháo gà bí nhà làm',
  mealType: 'main',
  ingredients: [{ id: 'ing_gao' }, { id: 'ing_ga', qty: 30, unit: 'g' }, { id: 'ing_bi' }],
  prepMin: 10,
  cookMin: 20,
  steps: ['Vo gạo', 'Nấu cháo'],
  ...overrides,
});

describe('CustomDishService.create (UC-23, FR-130..132)', () => {
  it('TC-CUS-001 stores the dish for the child and answers its recipe', async () => {
    const t = planningTestbed();
    const recipe = await t.customDishes.create(USER, CHILD, input());
    expect(recipe).toMatchObject({
      id: expect.stringMatching(/^custom_/),
      name: 'Cháo gà bí nhà làm',
      custom: true,
      reviewedBy: null,
      mealType: 'main',
      stages: [1, 2, 3, 4],
      selectedStage: 2,
      foodGroups: ['carb', 'protein', 'veg'],
      steps: ['Vo gạo', 'Nấu cháo'],
      safetyNotes: CUSTOM_SAFETY_NOTES,
      exclusion: null,
    });
    expect(recipe.ingredients.map((i) => [i.name, i.qty, i.unit, i.isMain])).toEqual([
      ['Gạo', null, null, false],
      ['Gà', 30, 'g', true],
      ['Rau 0', null, null, false],
    ]);
    expect(recipe.variants[1]).toEqual({
      stage: 2,
      texture: 'lumpy',
      portionText: 'Khoảng 125 ml',
      portionMl: null,
    });
    expect(t.customs.rows).toHaveLength(1);
    expect(t.customs.creators.get(recipe.id)).toBe(USER);
  });

  it('TC-CUS-002 refuses a dish with an avoided allergen, naming the food; nothing stored', async () => {
    const t = planningTestbed();
    t.children.rows.get(CHILD)!.info.avoidAllergens = ['egg'];
    t.history.pausedIds = new Set(['ing_bi']);
    const error = await t.customDishes
      .create(USER, CHILD, input({ ingredients: [{ id: 'ing_trung' }, { id: 'ing_bi' }] }))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CustomDishNotSafeError);
    expect((error as CustomDishNotSafeError).ingredients).toEqual([
      { id: 'ing_trung', name: 'Trứng', reason: 'allergen' },
      { id: 'ing_bi', name: 'Rau 0', reason: 'paused' },
    ]);
    expect(t.customs.rows).toEqual([]);
  });

  it('TC-CUS-004 refuses a name another dish of the child has, accents and case aside', async () => {
    const t = planningTestbed();
    await t.customDishes.create(USER, CHILD, input({ name: 'Cháo gà' }));
    await expect(t.customDishes.create(USER, CHILD, input({ name: 'CHAO GA' }))).rejects.toThrow(
      DishNameTakenError,
    );
  });

  it('TC-CUS-008 allows 50 dishes in use; deleted ones do not count', async () => {
    const t = planningTestbed();
    for (let i = 0; i < 50; i += 1) {
      await t.customDishes.create(USER, CHILD, input({ name: `Món số ${i}` }));
    }
    await expect(t.customDishes.create(USER, CHILD, input({ name: 'Món 51' }))).rejects.toThrow(
      CustomDishLimitError,
    );
    await t.customDishes.archive(USER, CHILD, t.customs.rows[0]!.id);
    await expect(
      t.customDishes.create(USER, CHILD, input({ name: 'Món 51' })),
    ).resolves.toMatchObject({ name: 'Món 51' });
  });

  it('passes on what the domain refuses', async () => {
    const t = planningTestbed();
    await expect(t.customDishes.create(USER, CHILD, input({ name: 'A' }))).rejects.toThrow(
      InvalidCustomDishError,
    );
    await expect(
      t.customDishes.create(USER, CHILD, input({ ingredients: [{ id: 'ing_pizza' }] })),
    ).rejects.toThrow(UnknownDishIngredientError);
  });

  it('TC-CUS-010 answers CHILD_NOT_FOUND for another family’s child', async () => {
    const t = planningTestbed();
    await expect(t.customDishes.create('u-2', CHILD, input())).rejects.toThrow(
      PlanChildNotFoundError,
    );
  });
});

describe('CustomDishService.form / update (FR-135)', () => {
  it('gives the dish back as it was entered', async () => {
    const t = planningTestbed();
    const { id } = await t.customDishes.create(USER, CHILD, input());
    expect(await t.customDishes.form(USER, CHILD, id)).toEqual({
      id,
      name: 'Cháo gà bí nhà làm',
      mealType: 'main',
      ingredients: [
        { id: 'ing_gao', name: 'Gạo', foodGroup: 'carb', qty: null, unit: null },
        { id: 'ing_ga', name: 'Gà', foodGroup: 'protein', qty: 30, unit: 'g' },
        { id: 'ing_bi', name: 'Rau 0', foodGroup: 'veg', qty: null, unit: null },
      ],
      prepMin: 10,
      cookMin: 20,
      steps: ['Vo gạo', 'Nấu cháo'],
    });
  });

  it('TC-CUS-011 updates the dish and the first tries of upcoming meals using it', async () => {
    const t = planningTestbed();
    await t.dayPlans.getDay(USER, CHILD, TODAY);
    const { id } = await t.customDishes.create(USER, CHILD, input());
    const dinner = [...t.plans.rows.values()].find((m) => m.slot === 'dinner')!;
    const past = [...t.plans.rows.values()].find((m) => m.slot === 'breakfast')!;
    t.plans.put(PlannedMeal.restore({ ...snapshot(dinner), dishId: id, newIngredientIds: [] }));
    t.plans.put(PlannedMeal.restore({ ...snapshot(past), dishId: id, status: 'eaten' }));
    t.history.triedIds.delete('ing_bo');

    const recipe = await t.customDishes.update(
      USER,
      CHILD,
      id,
      input({ name: 'Cháo bò bí', ingredients: [{ id: 'ing_gao' }, { id: 'ing_bo' }] }),
    );
    expect(recipe).toMatchObject({ name: 'Cháo bò bí', foodGroups: ['carb', 'protein'] });
    expect(t.plans.rows.get(dinner.id)!.newIngredientIds).toEqual(['ing_bo']);
    expect(t.plans.rows.get(past.id)!.newIngredientIds).toEqual(past.newIngredientIds);
    expect(t.uow.runs).toBe(1);
  });

  it('keeps its own name when renamed to the same words', async () => {
    const t = planningTestbed();
    const { id } = await t.customDishes.create(USER, CHILD, input());
    await expect(
      t.customDishes.update(USER, CHILD, id, input({ name: 'cháo gà bí nhà làm', cookMin: 30 })),
    ).resolves.toMatchObject({ cookMin: 30 });
  });

  it('TC-CUS-011 refuses an edit that makes the dish unsafe', async () => {
    const t = planningTestbed();
    t.children.rows.get(CHILD)!.info.avoidIngredients = ['ing_bo'];
    const { id } = await t.customDishes.create(USER, CHILD, input());
    await expect(
      t.customDishes.update(USER, CHILD, id, input({ ingredients: [{ id: 'ing_bo' }] })),
    ).rejects.toThrow(CustomDishNotSafeError);
  });

  it('does not touch the plan of a child who is not planned', async () => {
    const t = planningTestbed();
    const { id } = await t.customDishes.create(USER, CHILD, input());
    t.children.rows.get(CHILD)!.info.stage = null;
    await expect(
      t.customDishes.update(USER, CHILD, id, input({ cookMin: 25 })),
    ).resolves.toMatchObject({ cookMin: 25 });
  });

  it('TC-CUS-014 answers DISH_NOT_FOUND for a deleted, unknown or catalog dish', async () => {
    const t = planningTestbed();
    const { id } = await t.customDishes.create(USER, CHILD, input());
    await t.customDishes.archive(USER, CHILD, id);
    await expect(t.customDishes.form(USER, CHILD, id)).rejects.toThrow(DishNotFoundError);
    await expect(t.customDishes.update(USER, CHILD, id, input())).rejects.toThrow(
      DishNotFoundError,
    );
    await expect(t.customDishes.archive(USER, CHILD, id)).rejects.toThrow(DishNotFoundError);
    await expect(t.customDishes.form(USER, CHILD, 'dish_ga_0')).rejects.toThrow(DishNotFoundError);
  });
});

describe('CustomDishService.archive (FR-136, BR-86)', () => {
  it('TC-CUS-013 plans upcoming meals again, keeps eaten ones and still names them', async () => {
    const t = planningTestbed();
    await t.dayPlans.getDay(USER, CHILD, TODAY);
    const { id } = await t.customDishes.create(USER, CHILD, input());
    const [breakfast, lunch] = [...t.plans.rows.values()].sort((a, b) =>
      a.time.localeCompare(b.time),
    );
    t.plans.put(PlannedMeal.restore({ ...snapshot(breakfast!), dishId: id, status: 'eaten' }));
    t.plans.put(PlannedMeal.restore({ ...snapshot(lunch!), dishId: id, source: 'swap' }));

    await t.customDishes.archive(USER, CHILD, id);

    expect(t.customs.rows[0]!.archivedAt).toEqual(t.clock.now());
    const day = await t.dayPlans.getDay(USER, CHILD, TODAY);
    expect(day.meals[0]!.dish).toMatchObject({ id, name: 'Cháo gà bí nhà làm', custom: true });
    expect(day.meals[1]!.dish.id).not.toBe(id);
    const library = await t.library.search(USER, CHILD, { chip: 'custom' });
    expect(library.dishes).toEqual([]);
  });
});
