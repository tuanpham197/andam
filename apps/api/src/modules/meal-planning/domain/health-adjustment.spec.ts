import { catalogContext, dishFixture } from '../../../../test/fakes/meal-planning-fixtures.js';
import {
  HEALTH_ADJUSTMENTS,
  scalePortion,
  servingFor,
  softenTexture,
} from './health-adjustment.js';
import { generateDay, slotsForDay, type StageSchedule } from './menu-engine.js';

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

describe('health adjustments (BR-50..53)', () => {
  it('TC-HLT-001 sick GĐ2: one more snack, ~90 ml, one texture softer, no first tries', () => {
    const ctx = catalogContext({ health: 'sick', tried: new Set() });
    const slots = slotsForDay(GD2, 'sick');
    expect(slots).toHaveLength(5);
    const { meals } = generateDay(ctx, {
      date: '2026-09-24',
      slots,
      history: [],
      allergenIntroductions: [],
    });
    // Nothing is tried yet, so only dishes made of staples can be served.
    expect(meals.every((m) => m.newIngredientIds.length === 0)).toBe(true);
    for (const meal of meals.filter((m) => !m.slot.endsWith('snack'))) {
      expect(meal.texture).toBe('mashed');
      expect(meal.portionText).toBe('Khoảng 90 ml');
    }
  });

  it('TC-HLT-002 sick at GĐ1 stays smooth: there is no softer texture', () => {
    expect(servingFor(dishFixture(), { stage: 1, health: 'sick' }).texture).toBe('puree_smooth');
    expect(softenTexture('puree_smooth', 1)).toBe('puree_smooth');
    expect(softenTexture('family', 1)).toBe('minced_soft');
  });

  it('TC-HLT-004 keeps portions written in spoons, with a note', () => {
    expect(servingFor(dishFixture(), { stage: 1, health: 'sick' }).portionText).toBe(
      '2–3 thìa · ít hơn bình thường',
    );
  });

  it('recovering: stage texture, 85% portion (BR-53)', () => {
    expect(servingFor(dishFixture(), { stage: 2, health: 'recovering' })).toEqual({
      texture: 'lumpy',
      portionText: '100–130 ml',
    });
  });

  it('normal: the stage variant as written', () => {
    expect(servingFor(dishFixture(), { stage: 2, health: 'normal' })).toEqual({
      texture: 'lumpy',
      portionText: '120–150 ml',
    });
  });

  it('scales every amount of a range in ml and never goes below 10 ml', () => {
    expect(scalePortion('120–150 ml tham khảo', 70)).toBe('80–110 ml tham khảo');
    expect(scalePortion('Khoảng 5 ml', 70)).toBe('Khoảng 10 ml');
    expect(scalePortion('Khoảng 125 ml', 100)).toBe('Khoảng 125 ml');
  });

  it('describes each status for the preview (FR-083)', () => {
    expect(HEALTH_ADJUSTMENTS.sick).toEqual({
      extraSnacks: 1,
      portionPercent: 70,
      softerTexture: 1,
      pauseNewFoods: true,
    });
    expect(HEALTH_ADJUSTMENTS.normal.pauseNewFoods).toBe(false);
  });
});
