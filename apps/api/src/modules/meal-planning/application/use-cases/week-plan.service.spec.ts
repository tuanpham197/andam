import { CHILD, USER, planningTestbed, snapshot } from '../../../../../test/fakes/meal-planning.js';
import {
  ChildNotPlannableError,
  InvalidWeekStartError,
  PlanChildNotFoundError,
  PlanExistsError,
  WeekOutOfRangeError,
} from '../../domain/errors.js';
import { PlannedMeal } from '../../domain/planned-meal.js';

const THIS_WEEK = '2026-09-21';
const NEXT_WEEK = '2026-09-28';

const mealsBetween = (t: ReturnType<typeof planningTestbed>, from: string, to: string) =>
  [...t.plans.rows.values()].filter((m) => m.date >= from && m.date <= to);

describe('WeekPlanService (UC-12/13)', () => {
  describe('getWeek', () => {
    it('shows Monday to Sunday, planning the days from today on (FR-090)', async () => {
      const t = planningTestbed();
      const week = await t.weeks.getWeek(USER, CHILD, THIS_WEEK);
      expect(week.days.map((d) => d.date)).toEqual([
        '2026-09-21',
        '2026-09-22',
        '2026-09-23',
        '2026-09-24',
        '2026-09-25',
        '2026-09-26',
        '2026-09-27',
      ]);
      expect(week.days.slice(0, 3).every((d) => d.meals.length === 0)).toBe(true);
      expect(week.days.slice(3).every((d) => d.meals.length === 4)).toBe(true);
      expect(week.days[3]!.groupsCovered).toBe(4);
      expect(week.stats).toMatchObject({ totalMeals: 16, daysFullGroups: 4 });
      expect(week.plannable).toBe(true);
    });

    it('TC-WK-004 never plans a past week: its indicators stay at 0', async () => {
      const t = planningTestbed();
      const week = await t.weeks.getWeek(USER, CHILD, '2026-09-14');
      expect(week.stats).toMatchObject({ totalMeals: 0, distinctDishes: 0, daysFullGroups: 0 });
      expect(t.plans.rows.size).toBe(0);
    });

    it('TC-WK-007 rejects a week that does not start on Monday', async () => {
      const t = planningTestbed();
      await expect(t.weeks.getWeek(USER, CHILD, '2026-09-22')).rejects.toThrow(
        InvalidWeekStartError,
      );
      await expect(t.weeks.getWeek(USER, CHILD, '2026-02-30')).rejects.toThrow(
        InvalidWeekStartError,
      );
    });

    it('hides another user’s child', async () => {
      const t = planningTestbed();
      await expect(t.weeks.getWeek('u-2', CHILD, THIS_WEEK)).rejects.toThrow(
        PlanChildNotFoundError,
      );
    });

    it('shows a child outside the planning age without planning anything', async () => {
      const t = planningTestbed();
      t.children.rows.get(CHILD)!.info.stage = null;
      const week = await t.weeks.getWeek(USER, CHILD, THIS_WEEK);
      expect(week.plannable).toBe(false);
      expect(t.plans.rows.size).toBe(0);
    });
  });

  describe('generate (UC-13, FR-094)', () => {
    it('plans next week in one go when nothing is planned yet', async () => {
      const t = planningTestbed();
      const week = await t.weeks.generate(USER, CHILD, NEXT_WEEK, false);
      expect(week.days.every((d) => d.meals.length === 4)).toBe(true);
      expect(week.stats.totalMeals).toBe(28);
    });

    it('TC-WK-005 asks before replacing a plan, then keeps what was cooked or logged', async () => {
      const t = planningTestbed();
      await t.weeks.getWeek(USER, CHILD, NEXT_WEEK);
      await expect(t.weeks.generate(USER, CHILD, NEXT_WEEK, false)).rejects.toThrow(
        PlanExistsError,
      );

      const [first, second] = mealsBetween(t, NEXT_WEEK, NEXT_WEEK);
      t.plans.put(PlannedMeal.restore({ ...snapshot(first!), status: 'prepared' }));
      t.plans.put(PlannedMeal.restore({ ...snapshot(second!), source: 'swap' }));
      const before = new Set(t.plans.rows.keys());

      const week = await t.weeks.generate(USER, CHILD, NEXT_WEEK, true);
      expect(week.stats.totalMeals).toBe(28);
      expect(t.plans.rows.has(first!.id)).toBe(true);
      // A parent's own swap is replaced too: they asked for a new week.
      expect(t.plans.rows.has(second!.id)).toBe(false);
      expect([...t.plans.rows.keys()].filter((id) => before.has(id))).toEqual([first!.id]);
    });

    it('replaces only the meals still ahead in the current week', async () => {
      const t = planningTestbed();
      await t.weeks.getWeek(USER, CHILD, THIS_WEEK);
      const breakfast = mealsBetween(t, '2026-09-24', '2026-09-24').find(
        (m) => m.slot === 'breakfast',
      )!;
      await t.weeks.generate(USER, CHILD, THIS_WEEK, true);
      // 07:30 today is already past at 09:00.
      expect(t.plans.rows.get(breakfast.id)?.dishId).toBe(breakfast.dishId);
      expect(mealsBetween(t, '2026-09-24', '2026-09-27')).toHaveLength(16);
    });

    it('TC-WK-006 refuses a week past the next one, or one already over', async () => {
      const t = planningTestbed();
      await expect(t.weeks.generate(USER, CHILD, '2026-10-05', false)).rejects.toThrow(
        WeekOutOfRangeError,
      );
      await expect(t.weeks.generate(USER, CHILD, '2026-09-14', false)).rejects.toThrow(
        WeekOutOfRangeError,
      );
    });

    it('refuses a child outside the planning age', async () => {
      const t = planningTestbed();
      t.children.rows.get(CHILD)!.info.stage = null;
      await expect(t.weeks.generate(USER, CHILD, NEXT_WEEK, false)).rejects.toThrow(
        ChildNotPlannableError,
      );
    });
  });
});
