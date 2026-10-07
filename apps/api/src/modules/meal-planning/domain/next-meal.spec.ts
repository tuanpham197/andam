import { nextMealId } from './next-meal.js';

const meal = (
  id: string,
  time: string,
  status: 'planned' | 'prepared' | 'eaten' | 'refused' | 'skipped',
) => ({ id, time, status });

describe('nextMealId (BR-30)', () => {
  it('TC-NXT-001 is the first meal of the day when nothing happened yet', () => {
    expect(
      nextMealId([meal('lunch', '11:00', 'planned'), meal('breakfast', '07:30', 'planned')]),
    ).toBe('breakfast');
  });

  it('TC-NXT-002 stays on an earlier meal that was not logged, even past its time', () => {
    expect(nextMealId([meal('b', '07:30', 'prepared'), meal('l', '11:00', 'planned')])).toBe('b');
  });

  it('skips eaten, refused and TC-NXT-005 skipped meals', () => {
    expect(
      nextMealId([
        meal('b', '07:30', 'eaten'),
        meal('s', '09:30', 'skipped'),
        meal('m', '10:00', 'refused'),
        meal('l', '11:00', 'planned'),
      ]),
    ).toBe('l');
  });

  it('TC-NXT-003 is null once every meal is done', () => {
    expect(nextMealId([meal('b', '07:30', 'eaten'), meal('l', '11:00', 'refused')])).toBeNull();
    expect(nextMealId([])).toBeNull();
  });
});
