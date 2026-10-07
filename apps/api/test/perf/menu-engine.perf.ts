import { addDays } from '../../src/shared/kernel/local-date.js';
import { generateDay, slotsForDay } from '../../src/modules/meal-planning/domain/menu-engine.js';
import type { MealUse } from '../../src/modules/meal-planning/domain/model.js';
import { catalogFixture, contextFixture } from '../fakes/meal-planning-fixtures.js';

// Timing budgets live outside the unit project: under coverage instrumentation
// and a loaded CI runner the numbers are meaningless (run with `npm run test:perf`).
describe('menu engine performance (NFR-002)', () => {
  it('TC-ENG-019 plans 7 days on a 200-dish catalog in under 200 ms', () => {
    const { ingredients, dishes } = catalogFixture();
    const many = Array.from({ length: 200 }, (_, i) => ({
      ...dishes[i % dishes.length]!,
      id: `dish_${i}`,
    }));
    const ctx = contextFixture({ ingredients, dishes: many, tried: new Set(ingredients.keys()) });
    const slots = slotsForDay(
      {
        mainMeals: 3,
        snacksMin: 1,
        schedule: [
          { slot: 'breakfast', time: '07:30' },
          { slot: 'lunch', time: '11:00' },
          { slot: 'afternoon_snack', time: '15:00' },
          { slot: 'dinner', time: '18:00' },
        ],
      },
      'normal',
    );
    const planWeek = () => {
      const history: MealUse[] = [];
      for (let d = 0; d < 7; d += 1) {
        const date = addDays('2026-09-24', d);
        const { meals } = generateDay(ctx, { date, slots, history, allergenIntroductions: [] });
        history.push(...meals.map((m) => ({ date, slot: m.slot, dishId: m.dishId })));
      }
      return history;
    };
    // Warm-up so JIT compilation is not billed to the measured run.
    planWeek();

    const started = performance.now();
    const history = planWeek();
    expect(performance.now() - started).toBeLessThan(200);
    expect(history).toHaveLength(28);
  });
});
