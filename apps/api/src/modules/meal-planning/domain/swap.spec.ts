import fc from 'fast-check';
import { addDays } from '../../../shared/kernel/local-date.js';
import { catalogContext } from '../../../../test/fakes/meal-planning-fixtures.js';
import type { MealUse, PlanDish, PlanningContext } from './model.js';
import { exclusionReason } from './safety-filter.js';
import { MAX_SUGGESTIONS, suggestSwaps, SWAP_REASONS, type SwapRequest } from './swap.js';

const DATE = '2026-09-24';

/** Lunch of bé Na: a fish porridge, with chicken for breakfast and beef for dinner. */
const request = (overrides: Partial<SwapRequest> = {}): SwapRequest => ({
  date: DATE,
  slot: 'lunch',
  currentDishId: 'dish_ca_0',
  reason: 'other',
  history: [
    { date: DATE, slot: 'breakfast', dishId: 'dish_ga_0' },
    { date: DATE, slot: 'dinner', dishId: 'dish_bo_0' },
  ],
  allergenIntroductions: [],
  ...overrides,
});

const dishOf = (ctx: PlanningContext, id: string) => ctx.dishes.find((d) => d.id === id)!;
const ids = (result: ReturnType<typeof suggestSwaps>) => result.ranked.map((c) => c.dishId);

describe('suggestSwaps (UC-06)', () => {
  it('offers other main dishes for a main meal, never the current one, at most 5', () => {
    const ctx = catalogContext();
    const result = suggestSwaps(ctx, request());
    expect(result.ranked).toHaveLength(MAX_SUGGESTIONS);
    for (const id of ids(result)) {
      expect(id).not.toBe('dish_ca_0');
      expect(dishOf(ctx, id).mealType).toBe('main');
    }
    expect(result.relaxedWindowDays).toBeNull();
  });

  it('gives each candidate the stage texture and portion, and at most 3 reasons by priority', () => {
    const result = suggestSwaps(catalogContext(), request());
    const best = result.ranked[0]!;
    expect(best).toMatchObject({ texture: 'lumpy', portionText: 'Khoảng 125 ml' });
    expect(best.reasons.length).toBeLessThanOrEqual(3);
    // A fresh dish with a protein the day does not have yet, full groups.
    expect(best.reasons).toEqual(['NOT_USED_7D', 'DIFFERENT_PROTEIN', 'FOUR_GROUPS']);
  });

  it('prefers a protein the other main meals of the day do not have, ignoring the swapped meal', () => {
    const result = suggestSwaps(catalogContext(), request());
    const proteins = result.ranked
      .slice(0, 3)
      .map((c) => dishOf(catalogContext(), c.dishId).mainProtein);
    expect(proteins).not.toContain('chicken');
    expect(proteins).not.toContain('beef');
    // The swapped fish lunch does not count against fish.
    expect(
      suggestSwaps(catalogContext(), request({ currentDishId: 'dish_ga_1' })).ranked.some(
        (c) => c.dishId === 'dish_ga_0',
      ),
    ).toBe(false);
  });

  it('offers snacks for a snack slot, without the four-group score', () => {
    const ctx = catalogContext();
    const result = suggestSwaps(
      ctx,
      request({ slot: 'afternoon_snack', currentDishId: 'dish_snack_le', history: [] }),
    );
    expect(ids(result).sort()).toEqual(['dish_snack_bo_qua', 'dish_snack_chuoi', 'dish_snack_tao']);
    for (const c of result.ranked) expect(c.reasons).not.toContain('FOUR_GROUPS');
  });

  describe('swap reasons (BR-27..29)', () => {
    it('TC-SWP-003 "thiếu nguyên liệu" leaves out dishes built on the same main ingredient', () => {
      const result = suggestSwaps(catalogContext(), request({ reason: 'missing_ingredient' }));
      for (const c of result.ranked)
        expect(dishOf(catalogContext(), c.dishId).mainIngredientIds).not.toContain('ing_ca');
    });

    it('still offers the same protein source when the main ingredient differs', () => {
      const base = catalogContext();
      const loc: PlanDish = {
        ...dishOf(base, 'dish_ca_1'),
        id: 'dish_ca_loc',
        ingredientIds: ['ing_gao', 'ing_ca_loc', 'ing_bi', 'ing_dau_an'],
        mainIngredientIds: ['ing_ca_loc'],
      };
      const ingredients = new Map(base.ingredients).set('ing_ca_loc', {
        ...base.ingredients.get('ing_ca')!,
        id: 'ing_ca_loc',
        name: 'Cá lóc',
      });
      const ctx = catalogContext({
        ingredients,
        dishes: [...base.dishes.filter((d) => d.mainProtein === 'fish'), loc],
        tried: new Set(ingredients.keys()),
      });
      expect(
        ids(suggestSwaps(ctx, request({ reason: 'missing_ingredient', history: [] }))),
      ).toEqual(['dish_ca_loc']);
      expect(ids(suggestSwaps(ctx, request({ reason: 'other', history: [] }))).sort()).toEqual([
        'dish_ca_1',
        'dish_ca_2',
        'dish_ca_loc',
      ]);
    });

    it('TC-SWP-004 "bé không thích" also leaves out the same main ingredient', () => {
      const result = suggestSwaps(catalogContext(), request({ reason: 'disliked' }));
      for (const c of result.ranked)
        expect(dishOf(catalogContext(), c.dishId).mainIngredientIds).not.toContain('ing_ca');
    });

    it('"cần nhanh hơn" keeps only quicker dishes, quickest first, saying by how much', () => {
      // dish_ca_2 takes 7 + 15 = 22 minutes; only the x_0 (20) and x_1 (21) dishes are quicker.
      const ctx = catalogContext();
      const result = suggestSwaps(ctx, request({ reason: 'faster', currentDishId: 'dish_ca_2' }));
      expect(result.ranked.length).toBeGreaterThan(0);
      for (const c of result.ranked) {
        const dish = dishOf(ctx, c.dishId);
        expect(dish.prepMin + dish.cookMin).toBeLessThan(22);
        expect(c.fasterByMin).toBe(22 - dish.prepMin - dish.cookMin);
        expect(c.reasons[0]).toBe('FASTER');
      }
    });

    it('TC-SWP-002 "cần nhanh hơn" when the meal is already the quickest: nothing', () => {
      const result = suggestSwaps(catalogContext(), request({ reason: 'faster' }));
      expect(result.ranked).toEqual([]);
    });

    it('reports minutes saved for any quicker candidate, whatever the reason', () => {
      const result = suggestSwaps(catalogContext(), request({ currentDishId: 'dish_ca_2' }));
      expect(result.ranked.some((c) => c.fasterByMin > 0)).toBe(true);
      expect(result.ranked.every((c) => !c.reasons.includes('FASTER'))).toBe(true);
    });

    it('accepts exactly the four reasons of the screen', () => {
      expect(SWAP_REASONS).toEqual(['missing_ingredient', 'disliked', 'faster', 'other']);
    });
  });

  describe('safety (BR-01..07): the hard filter is never relaxed', () => {
    it('counts what it left out among dishes of the same kind, by reason (FR-043)', () => {
      const ctx = catalogContext({ avoidAllergens: new Set(['egg']) });
      const result = suggestSwaps(ctx, request());
      expect(result.excluded.total).toBe(3);
      expect(result.excluded.byReason.allergen).toBe(3);
      for (const c of result.ranked) expect(dishOf(ctx, c.dishId).mainProtein).not.toBe('egg');
    });

    it('offers nothing rather than an unsafe dish when everything else is excluded', () => {
      const base = catalogContext();
      const ctx = catalogContext({
        avoidIngredients: new Set(['ing_ga', 'ing_bo', 'ing_heo', 'ing_dau_phu', 'ing_trung']),
        dishes: base.dishes.filter((d) => d.id === 'dish_ca_0' || d.mainProtein !== 'fish'),
      });
      const result = suggestSwaps(ctx, request({ history: [] }));
      expect(result.ranked).toEqual([]);
      expect(result.excluded.total).toBe(15);
    });

    it('property: no candidate ever breaks the filter, whatever the reason and catalog', () => {
      const base = catalogContext();
      const allergens = ['egg', 'fish', 'soy'] as const;
      const ingredientIds = [...base.ingredients.keys()];
      fc.assert(
        fc.property(
          fc.subarray([...allergens]),
          fc.subarray(ingredientIds),
          fc.subarray(ingredientIds),
          fc.constantFrom(...SWAP_REASONS),
          fc.constantFrom('breakfast', 'lunch', 'dinner', 'afternoon_snack'),
          (avoid, avoidIngredients, paused, reason, slot) => {
            const ctx = catalogContext({
              avoidAllergens: new Set(avoid),
              avoidIngredients: new Set(avoidIngredients),
              paused: new Set(paused),
            });
            const current = slot.endsWith('snack') ? 'dish_snack_le' : 'dish_ca_0';
            const result = suggestSwaps(ctx, request({ reason, slot, currentDishId: current }));
            for (const c of result.ranked)
              expect(exclusionReason(dishOf(ctx, c.dishId), ctx, DATE)).toBeNull();
          },
        ),
      );
    });
  });

  describe('anti-repeat window (BR-21)', () => {
    /** Every fish dish but one was eaten in the past days: few fish left. */
    const fishWeek = (): MealUse[] => [
      { date: addDays(DATE, -4), slot: 'lunch', dishId: 'dish_ca_1' },
      { date: addDays(DATE, -6), slot: 'lunch', dishId: 'dish_ca_2' },
    ];

    it('TC-SWP-012 relaxes to 3 days when fewer than 3 candidates are left, and says how recent', () => {
      const base = catalogContext();
      const ctx = catalogContext({ dishes: base.dishes.filter((d) => d.mainProtein === 'fish') });
      const result = suggestSwaps(ctx, request({ history: fishWeek() }));
      expect(result.relaxedWindowDays).toBe(3);
      expect(ids(result).sort()).toEqual(['dish_ca_1', 'dish_ca_2']);
      expect(result.ranked.find((c) => c.dishId === 'dish_ca_1')!.repeatInDays).toBe(-4);
    });

    it('never goes below 3 days: a dish from yesterday stays out', () => {
      const base = catalogContext();
      const ctx = catalogContext({ dishes: base.dishes.filter((d) => d.mainProtein === 'fish') });
      const result = suggestSwaps(
        ctx,
        request({ history: [{ date: addDays(DATE, -1), slot: 'lunch', dishId: 'dish_ca_1' }] }),
      );
      expect(ids(result)).toEqual(['dish_ca_2']);
    });

    it('marks an upcoming repeat with a positive offset', () => {
      const base = catalogContext();
      const ctx = catalogContext({ dishes: base.dishes.filter((d) => d.mainProtein === 'fish') });
      const result = suggestSwaps(
        ctx,
        request({
          history: [
            { date: addDays(DATE, 5), slot: 'lunch', dishId: 'dish_ca_1' },
            { date: addDays(DATE, -6), slot: 'lunch', dishId: 'dish_ca_2' },
          ],
        }),
      );
      expect(result.ranked.find((c) => c.dishId === 'dish_ca_1')!.repeatInDays).toBe(5);
    });

    it('reports the nearest of several repeats within the week', () => {
      const base = catalogContext();
      const ctx = catalogContext({ dishes: base.dishes.filter((d) => d.mainProtein === 'fish') });
      const result = suggestSwaps(
        ctx,
        request({
          history: [
            { date: addDays(DATE, -6), slot: 'lunch', dishId: 'dish_ca_1' },
            { date: addDays(DATE, 5), slot: 'dinner', dishId: 'dish_ca_1' },
            { date: addDays(DATE, -4), slot: 'lunch', dishId: 'dish_ca_2' },
          ],
        }),
      );
      expect(result.ranked.find((c) => c.dishId === 'dish_ca_1')!.repeatInDays).toBe(5);
    });

    it('leaves the offset empty for a dish not repeated within the week', () => {
      const result = suggestSwaps(catalogContext(), request());
      expect(result.ranked.every((c) => c.repeatInDays === null)).toBe(true);
    });
  });

  describe('new allergenic foods (BR-24/25)', () => {
    const shrimp = () => {
      const base = catalogContext();
      const ingredients = new Map(base.ingredients).set('ing_tom', {
        id: 'ing_tom',
        name: 'Tôm',
        foodGroup: 'protein',
        proteinSource: null,
        allergenTags: ['shellfish'],
        minAgeMonths: 6,
      });
      const dish: PlanDish = {
        ...dishOf(base, 'dish_heo_0'),
        id: 'dish_tom',
        mainProtein: 'pork',
        ingredientIds: ['ing_gao', 'ing_tom', 'ing_bi', 'ing_dau_an'],
        mainIngredientIds: ['ing_tom'],
      };
      // Only the shrimp dish is new: it gets the first-try bonus.
      return catalogContext({
        ingredients,
        dishes: [...base.dishes, dish],
        tried: new Set([...base.ingredients.keys()]),
      });
    };

    it('may introduce one at lunch, flagging it', () => {
      const result = suggestSwaps(shrimp(), request());
      const tom = result.ranked.find((c) => c.dishId === 'dish_tom');
      expect(tom?.newIngredientIds).toEqual(['ing_tom']);
    });

    it('never at dinner', () => {
      const result = suggestSwaps(
        shrimp(),
        request({
          slot: 'dinner',
          currentDishId: 'dish_bo_0',
          history: [{ date: DATE, slot: 'lunch', dishId: 'dish_ca_0' }],
        }),
      );
      expect(ids(result)).not.toContain('dish_tom');
    });

    it('not when another meal of the day already introduces one, nor within 3 days of the last', () => {
      const ctx = shrimp();
      const withIntro = suggestSwaps(
        ctx,
        request({ history: [{ date: DATE, slot: 'breakfast', dishId: 'dish_tom' }] }),
      );
      expect(ids(withIntro)).not.toContain('dish_tom');
      const spaced = suggestSwaps(ctx, request({ allergenIntroductions: [addDays(DATE, -2)] }));
      expect(ids(spaced)).not.toContain('dish_tom');
    });

    it('TC-SWP-013 can replace the very meal that held today’s introduction', () => {
      const base = shrimp();
      const second: PlanDish = {
        ...dishOf(base, 'dish_tom'),
        id: 'dish_tom_rau',
        ingredientIds: ['ing_gao', 'ing_tom', 'ing_rau', 'ing_dau_an'],
      };
      const ctx = catalogContext({ ...base, dishes: [...base.dishes, second] });
      // Lunch is the shrimp introduction; swapping it frees the day's one introduction.
      const result = suggestSwaps(ctx, request({ currentDishId: 'dish_tom' }));
      expect(ids(result)).toContain('dish_tom_rau');
      expect(ids(result)).not.toContain('dish_tom');
    });
  });

  it('is deterministic: same input, same suggestions (NFR-009)', () => {
    expect(suggestSwaps(catalogContext(), request())).toEqual(
      suggestSwaps(catalogContext(), request()),
    );
  });
});
