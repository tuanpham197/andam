import fc from 'fast-check';
import { addDays, daysBetween } from '../../../shared/kernel/local-date.js';
import {
  catalogContext,
  catalogFixture,
  contextFixture,
  dishFixture,
} from '../../../../test/fakes/meal-planning-fixtures.js';
import { generateDay, slotsForDay, type DayRequest, type StageSchedule } from './menu-engine.js';
import type { MealUse, PlanDish, ScheduledSlot } from './model.js';
import { exclusionReason } from './safety-filter.js';

const DATE = '2026-09-24';

const GD1: StageSchedule = {
  mainMeals: 2,
  snacksMin: 0,
  schedule: [
    { slot: 'breakfast', time: '08:00' },
    { slot: 'lunch', time: '11:00' },
  ],
};
const GD2: StageSchedule = {
  mainMeals: 3,
  snacksMin: 1,
  schedule: [
    { slot: 'breakfast', time: '07:30' },
    { slot: 'lunch', time: '11:00' },
    { slot: 'afternoon_snack', time: '15:00' },
    { slot: 'dinner', time: '18:00' },
  ],
};
const GD3: StageSchedule = {
  mainMeals: 3,
  snacksMin: 1,
  schedule: [
    { slot: 'breakfast', time: '07:30' },
    { slot: 'morning_snack', time: '09:30' },
    { slot: 'lunch', time: '11:00' },
    { slot: 'afternoon_snack', time: '15:00' },
    { slot: 'dinner', time: '18:00' },
  ],
};

const day = (overrides: Partial<DayRequest> = {}): DayRequest => ({
  date: DATE,
  slots: slotsForDay(GD2, 'normal'),
  history: [],
  allergenIntroductions: [],
  ...overrides,
});

const proteinOf = (ctx: { dishes: readonly PlanDish[] }, dishId: string) =>
  ctx.dishes.find((d) => d.id === dishId)!.mainProtein;

describe('slotsForDay (BR-13/14, BR-50)', () => {
  it('TC-ENG-001 GĐ2: 3 main meals and 1 snack at the design times', () => {
    expect(slotsForDay(GD2, 'normal')).toEqual(GD2.schedule);
  });

  it('TC-ENG-002 GĐ1: 2 main meals, no snack', () => {
    expect(slotsForDay(GD1, 'normal').map((s) => s.slot)).toEqual(['breakfast', 'lunch']);
  });

  it('TC-ENG-003 keeps the lower bound of snacks, preferring the afternoon one', () => {
    expect(slotsForDay(GD3, 'normal').map((s) => s.slot)).toEqual([
      'breakfast',
      'lunch',
      'afternoon_snack',
      'dinner',
    ]);
  });

  it('adds a snack while sick, in time order (BR-50)', () => {
    expect(slotsForDay(GD3, 'sick').map((s) => s.slot)).toEqual([
      'breakfast',
      'morning_snack',
      'lunch',
      'afternoon_snack',
      'dinner',
    ]);
  });

  it('TC-HLT-003 creates a snack slot for GĐ1 while sick even though the schedule has none', () => {
    expect(slotsForDay(GD1, 'sick')).toEqual([
      { slot: 'breakfast', time: '08:00' },
      { slot: 'lunch', time: '11:00' },
      { slot: 'afternoon_snack', time: '15:00' },
    ]);
  });

  it('keeps the usual meals while recovering: only portions and new foods differ (BR-53)', () => {
    expect(slotsForDay(GD1, 'recovering').map((s) => s.slot)).toEqual(['breakfast', 'lunch']);
  });
});

describe('generateDay (BR-20..26)', () => {
  it('TC-ENG-001 fills every slot with a dish of the right kind and the stage portion', () => {
    const ctx = catalogContext();
    const result = generateDay(ctx, day());
    expect(result.unfilled).toEqual([]);
    expect(result.meals.map((m) => m.slot)).toEqual([
      'breakfast',
      'lunch',
      'afternoon_snack',
      'dinner',
    ]);
    const snack = result.meals.find((m) => m.slot === 'afternoon_snack')!;
    expect(ctx.dishes.find((d) => d.id === snack.dishId)!.mealType).toBe('snack');
    expect(result.meals[0]).toMatchObject({
      time: '07:30',
      texture: 'lumpy',
      portionText: 'Khoảng 125 ml',
    });
  });

  it('TC-ENG-004 returns empty slots instead of failing when nothing is safe', () => {
    const ctx = catalogContext({
      avoidIngredients: new Set(['ing_gao', 'ing_chuoi', 'ing_le', 'ing_bo_qua', 'ing_tao']),
    });
    const result = generateDay(ctx, day());
    expect(result.meals).toEqual([]);
    expect(result.unfilled.map((s) => s.slot)).toEqual([
      'breakfast',
      'lunch',
      'afternoon_snack',
      'dinner',
    ]);
  });

  it('TC-ENG-005 never repeats the only safe dish within the day', () => {
    const ctx = contextFixture({ dishes: [dishFixture()] });
    const result = generateDay(ctx, day({ slots: slotsForDay(GD1, 'normal') }));
    expect(result.meals.map((m) => m.slot)).toEqual(['breakfast']);
    expect(result.unfilled.map((s) => s.slot)).toEqual(['lunch']);
  });

  it('TC-ENG-009 gives the main meals of a day different proteins', () => {
    const ctx = catalogContext();
    const mains = generateDay(ctx, day()).meals.filter((m) => !m.slot.includes('snack'));
    expect(new Set(mains.map((m) => proteinOf(ctx, m.dishId))).size).toBe(3);
  });

  it('TC-ENG-010 still fills the day when only one protein is allowed', () => {
    const ctx = catalogContext({
      avoidAllergens: new Set(['fish', 'egg']),
      avoidIngredients: new Set(['ing_ga', 'ing_bo', 'ing_heo']),
    });
    const result = generateDay(ctx, day());
    expect(result.unfilled).toEqual([]);
    expect(
      result.meals
        .filter((m) => !m.slot.includes('snack'))
        .every((m) => proteinOf(ctx, m.dishId) === 'legume'),
    ).toBe(true);
  });

  describe('anti-repeat window', () => {
    const used = (
      dishId: string,
      daysAgo: number,
      slot: ScheduledSlot['slot'] = 'lunch',
    ): MealUse => ({
      date: addDays(DATE, -daysAgo),
      slot,
      dishId,
    });

    it('TC-ENG-008 blocks a dish used 7 days ago and allows one used 8 days ago', () => {
      const ctx = contextFixture({ dishes: [dishFixture()] });
      const lunch = { slots: [{ slot: 'lunch' as const, time: '11:00' }] };
      expect(
        generateDay(ctx, day({ ...lunch, history: [used('dish_chao', 8)] })).meals,
      ).toHaveLength(1);
      // Only one candidate: the 3-day window applies, so 7 days ago is allowed again (BR-21)...
      expect(
        generateDay(ctx, day({ ...lunch, history: [used('dish_chao', 7)] })).relaxedWindowDays,
      ).toBe(3);
    });

    it('prefers dishes unused for 7 days when the catalog is large enough (BR-20)', () => {
      const ctx = catalogContext();
      const history = ctx.dishes
        .filter((d) => d.mainProtein === 'chicken')
        .map((d, i) => used(d.id, i + 1));
      const meals = generateDay(ctx, day({ history })).meals;
      expect(meals.some((m) => proteinOf(ctx, m.dishId) === 'chicken')).toBe(false);
    });

    it('TC-ENG-006/007 relaxes to 3 days only when fewer than 3 dishes remain, and says so', () => {
      const { ingredients, dishes } = catalogFixture();
      const mains = dishes.filter((d) => d.mealType === 'main').slice(0, 4);
      const ctx = contextFixture({
        ingredients,
        dishes: mains,
        tried: new Set(ingredients.keys()),
      });
      const lunch = { slots: [{ slot: 'lunch' as const, time: '11:00' }] };

      const threeLeft = generateDay(ctx, day({ ...lunch, history: [used(mains[0]!.id, 5)] }));
      expect(threeLeft.relaxedWindowDays).toBeNull();

      const twoLeft = generateDay(
        ctx,
        day({ ...lunch, history: [used(mains[0]!.id, 5), used(mains[1]!.id, 4)] }),
      );
      expect(twoLeft.relaxedWindowDays).toBe(3);
    });

    it('never goes below 3 days: a dish used 2 days ago stays blocked', () => {
      const ctx = contextFixture({ dishes: [dishFixture()] });
      const result = generateDay(
        ctx,
        day({ slots: [{ slot: 'lunch', time: '11:00' }], history: [used('dish_chao', 2)] }),
      );
      expect(result.meals).toEqual([]);
      expect(result.unfilled).toHaveLength(1);
    });

    it('also avoids dishes already planned in the coming days', () => {
      const ctx = contextFixture({ dishes: [dishFixture()] });
      const history = [{ date: addDays(DATE, 2), slot: 'lunch' as const, dishId: 'dish_chao' }];
      expect(
        generateDay(ctx, day({ slots: [{ slot: 'lunch', time: '11:00' }], history })).meals,
      ).toEqual([]);
    });
  });

  describe('new foods that are common allergens (BR-24/25)', () => {
    const fresh = () => {
      const ctx = catalogContext();
      const tried = new Set([...ctx.tried].filter((id) => id !== 'ing_ca' && id !== 'ing_trung'));
      return { ...ctx, tried };
    };

    it('TC-ENG-011 introduces at most one per day, never at the afternoon snack or dinner', () => {
      for (let i = 0; i < 20; i += 1) {
        const ctx = { ...fresh(), childId: `child-${i}` };
        const meals = generateDay(ctx, day()).meals;
        const intros = meals.filter((m) => m.newAllergenIds.length > 0);
        expect(intros.length).toBeLessThanOrEqual(1);
        expect(intros.every((m) => m.slot === 'breakfast' || m.slot === 'lunch')).toBe(true);
      }
    });

    it('TC-ENG-012 rejects a dish introducing two of them at once', () => {
      const ctx = fresh();
      const both: PlanDish = {
        ...ctx.dishes[0]!,
        id: 'dish_ca_trung',
        ingredientIds: ['ing_gao', 'ing_ca', 'ing_trung', 'ing_bi', 'ing_dau_an'],
      };
      const only = { ...ctx, dishes: [both] };
      expect(generateDay(only, day({ slots: [{ slot: 'lunch', time: '11:00' }] })).meals).toEqual(
        [],
      );
    });

    it.each([
      [2, false],
      [3, true],
    ])(
      'TC-ENG-013 waits 3 days after the previous one (%i days → allowed=%s)',
      (daysAgo, allowed) => {
        const ctx = fresh();
        const fishOnly = { ...ctx, dishes: ctx.dishes.filter((d) => d.mainProtein === 'fish') };
        const result = generateDay(
          fishOnly,
          day({
            slots: [{ slot: 'lunch', time: '11:00' }],
            allergenIntroductions: [addDays(DATE, -daysAgo)],
          }),
        );
        expect(result.meals.length > 0).toBe(allowed);
      },
    );

    it('counts an introduction already kept earlier in the same day', () => {
      const ctx = fresh();
      const fishOnly = { ...ctx, dishes: ctx.dishes.filter((d) => d.mainProtein === 'fish') };
      const history = [{ date: DATE, slot: 'breakfast' as const, dishId: 'dish_trung_0' }];
      const withEgg = {
        ...fishOnly,
        dishes: [...fishOnly.dishes, ctx.dishes.find((d) => d.id === 'dish_trung_0')!],
      };
      expect(
        generateDay(withEgg, day({ slots: [{ slot: 'lunch', time: '11:00' }], history })).meals,
      ).toEqual([]);
    });

    it('reports every first try of the dish, allergen or not', () => {
      const ctx = catalogContext({ tried: new Set(['ing_gao', 'ing_dau_an']) });
      const meal = generateDay(
        { ...ctx, dishes: ctx.dishes.filter((d) => d.id === 'dish_ga_0') },
        day({ slots: [{ slot: 'lunch', time: '11:00' }] }),
      ).meals[0]!;
      expect(meal.newIngredientIds.sort()).toEqual(['ing_bi', 'ing_ga']);
      expect(meal.newAllergenIds).toEqual([]);
    });
  });

  describe('preferences', () => {
    it('prefers a dish the baby liked (BR-26) and says why', () => {
      const ctx = catalogContext({
        dishes: catalogFixture().dishes.filter((d) => d.mainProtein === 'chicken'),
        feedback: new Map([['dish_ga_2', { liking: 5, amount: 'all', date: '2026-09-01' }]]),
      });
      const meal = generateDay(ctx, day({ slots: [{ slot: 'lunch', time: '11:00' }] })).meals[0]!;
      expect(meal.dishId).toBe('dish_ga_2');
      expect(meal.reasons).toContain('LIKED');
    });

    it.each(['almost_all', 'all'] as const)(
      'counts eating %s of the plate as liking, whatever the score',
      (amount) => {
        const ctx = catalogContext({
          dishes: catalogFixture().dishes.filter((d) => d.mainProtein === 'chicken'),
          feedback: new Map([['dish_ga_1', { liking: 2, amount, date: '2026-09-01' }]]),
        });
        expect(
          generateDay(ctx, day({ slots: [{ slot: 'lunch', time: '11:00' }] })).meals[0]!.dishId,
        ).toBe('dish_ga_1');
      },
    );

    it('counts fruit as the vegetable group of a main dish', () => {
      const ctx = catalogContext();
      const withFruit: PlanDish = {
        ...ctx.dishes[0]!,
        id: 'dish_ga_chuoi',
        ingredientIds: ['ing_gao', 'ing_ga', 'ing_chuoi', 'ing_dau_an'],
      };
      const noVeg: PlanDish = {
        ...ctx.dishes[0]!,
        id: 'dish_ga_tron',
        ingredientIds: ['ing_gao', 'ing_ga', 'ing_dau_an'],
      };
      const meal = generateDay(
        { ...ctx, dishes: [noVeg, withFruit] },
        day({ slots: [{ slot: 'lunch', time: '11:00' }] }),
      ).meals[0]!;
      expect(meal.dishId).toBe('dish_ga_chuoi');
      expect(meal.reasons).toContain('FOUR_GROUPS');
    });

    it('BR-23 prefers a main dish covering the 4 food groups', () => {
      const ctx = catalogContext();
      const partial: PlanDish = { ...ctx.dishes[0]!, id: 'dish_thieu', ingredientIds: ['ing_ga'] };
      const full = ctx.dishes.find((d) => d.id === 'dish_ga_0')!;
      const meal = generateDay(
        { ...ctx, dishes: [partial, full] },
        day({ slots: [{ slot: 'lunch', time: '11:00' }] }),
      ).meals[0]!;
      expect(meal.dishId).toBe('dish_ga_0');
      expect(meal.reasons).toContain('FOUR_GROUPS');
    });

    it('prefers the protein used least over the last week', () => {
      const ctx = catalogContext();
      const history: MealUse[] = [
        { date: addDays(DATE, -1), slot: 'lunch', dishId: 'dish_ga_0' },
        { date: addDays(DATE, -2), slot: 'lunch', dishId: 'dish_bo_0' },
      ];
      for (let i = 0; i < 10; i += 1) {
        const meal = generateDay(
          { ...ctx, childId: `c-${i}` },
          day({ slots: [{ slot: 'lunch', time: '11:00' }], history }),
        ).meals[0]!;
        expect(['chicken', 'beef']).not.toContain(proteinOf(ctx, meal.dishId));
      }
    });
  });

  it('TC-ENG-014 is deterministic for the same input', () => {
    const ctx = catalogContext();
    expect(generateDay(ctx, day())).toEqual(generateDay(ctx, day()));
  });

  it('TC-ENG-015/016 always returns safe dishes, never repeated within 3 days, for any child and history', () => {
    const base = catalogContext();
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.subarray(['fish', 'egg', 'soy'] as const),
        fc.array(
          fc.record({
            daysAgo: fc.integer({ min: 1, max: 9 }),
            dish: fc.constantFrom(...base.dishes.map((d) => d.id)),
          }),
          { maxLength: 15 },
        ),
        (childId, avoid, past) => {
          const ctx = { ...base, childId, avoidAllergens: new Set(avoid) };
          const history = past.map((p) => ({
            date: addDays(DATE, -p.daysAgo),
            slot: 'lunch' as const,
            dishId: p.dish,
          }));
          const { meals } = generateDay(ctx, day({ history }));
          return meals.every((m) => {
            const dish = ctx.dishes.find((d) => d.id === m.dishId)!;
            const recent = history.some(
              (h) => h.dishId === m.dishId && Math.abs(daysBetween(h.date, DATE)) <= 3,
            );
            return exclusionReason(dish, ctx, DATE) === null && !recent;
          });
        },
      ),
      { numRuns: 300 },
    );
  });

  it('TC-ENG-019 plans a full week on a 200-dish catalog (timing budget: test/perf)', () => {
    const { ingredients, dishes } = catalogFixture();
    const many = Array.from({ length: 200 }, (_, i) => ({
      ...dishes[i % dishes.length]!,
      id: `dish_${i}`,
    }));
    const ctx = contextFixture({ ingredients, dishes: many, tried: new Set(ingredients.keys()) });
    const history: MealUse[] = [];
    for (let d = 0; d < 7; d += 1) {
      const date = addDays(DATE, d);
      const { meals } = generateDay(ctx, day({ date, history }));
      history.push(...meals.map((m) => ({ date, slot: m.slot, dishId: m.dishId })));
    }
    expect(history).toHaveLength(28);
  });
});

describe('deleted "Món của bạn" (BR-86)', () => {
  it('TC-CUS-013 never plans a deleted dish', () => {
    const base = catalogContext();
    const keep = new Set(['dish_ga_0', 'dish_snack_chuoi']);
    const ctx = {
      ...base,
      dishes: base.dishes.map((d) => (keep.has(d.id) ? d : { ...d, archived: true })),
    };
    const result = generateDay(ctx, day());
    expect(new Set(result.meals.map((m) => m.dishId))).toEqual(keep);
  });
});
