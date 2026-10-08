import { careTestbed } from '../../../../../test/fakes/care.js';
import { CHILD, USER } from '../../../../../test/fakes/meal-planning.js';
import {
  IngredientNotPausedError,
  SafetyChildNotFoundError,
  SafetyOwnerOnlyError,
} from '../../domain/errors.js';

describe('PausedIngredientsService (G08, UC-14)', () => {
  it('lists the foods paused for the child', async () => {
    const t = careTestbed();
    await t.pauseService.pause({
      userId: USER,
      childId: CHILD,
      ingredientIds: ['ing_bi'],
      reason: 'urgent',
    });
    expect(await t.paused.list(USER, CHILD)).toEqual([
      {
        id: expect.any(String),
        ingredientId: 'ing_bi',
        name: 'Rau 0',
        reason: 'urgent',
        pausedAt: t.clock.now(),
        meal: null,
      },
    ]);
  });

  it('TC-RES-001 resumes a food and replans upcoming meals so it may come back', async () => {
    const t = careTestbed();
    await t.dayPlans.getDay(USER, CHILD, '2026-09-25');
    await t.pauseService.pause({
      userId: USER,
      childId: CHILD,
      ingredientIds: ['ing_bi'],
      reason: 'reaction',
    });
    t.events.published.length = 0;
    await t.paused.resume(USER, CHILD, 'ing_bi');
    expect(t.pauses.rows[0]).toMatchObject({ resumedAt: t.clock.now(), resumedBy: USER });
    expect(await t.paused.list(USER, CHILD)).toEqual([]);
    expect(t.events.published).toEqual([
      { type: 'IngredientResumed', childId: CHILD, userId: USER, ingredientId: 'ing_bi' },
    ]);
  });

  it('TC-RES-002 refuses a food that is not paused, publishing nothing', async () => {
    const t = careTestbed();
    await expect(t.paused.resume(USER, CHILD, 'ing_bi')).rejects.toThrow(IngredientNotPausedError);
    expect(t.events.published).toEqual([]);
  });

  it('TC-RES-003 a food resumed then paused again gets a new pause', async () => {
    const t = careTestbed();
    const pause = () =>
      t.pauseService.pause({
        userId: USER,
        childId: CHILD,
        ingredientIds: ['ing_bi'],
        reason: 'reaction',
      });
    await pause();
    await t.paused.resume(USER, CHILD, 'ing_bi');
    await pause();
    expect(t.pauses.rows.map((r) => r.resumedAt === null)).toEqual([false, true]);
  });

  it('TC-FAM-012 a caregiver sees the paused foods but cannot resume them (BR-73)', async () => {
    const t = careTestbed();
    t.children.rows.get(CHILD)!.caregivers = ['dad'];
    await t.pauseService.pause({
      userId: USER,
      childId: CHILD,
      ingredientIds: ['ing_bi'],
      reason: 'reaction',
    });
    expect(await t.paused.list('dad', CHILD)).toHaveLength(1);
    await expect(t.paused.resume('dad', CHILD, 'ing_bi')).rejects.toThrow(SafetyOwnerOnlyError);
    expect(t.pauses.rows[0]!.resumedAt).toBeNull();
  });

  it('answers CHILD_NOT_FOUND for another family’s child', async () => {
    const t = careTestbed();
    await expect(t.paused.list('u-2', CHILD)).rejects.toThrow(SafetyChildNotFoundError);
    await expect(t.paused.resume('u-2', CHILD, 'ing_bi')).rejects.toThrow(SafetyChildNotFoundError);
  });
});

describe('PauseService', () => {
  it('pauses nothing for an empty list, and names a food missing from the catalog by its id', async () => {
    const t = careTestbed();
    expect(
      await t.pauseService.pause({
        userId: USER,
        childId: CHILD,
        ingredientIds: [],
        reason: 'urgent',
      }),
    ).toEqual([]);
    t.context.ingredientNames = async () => new Map();
    expect(
      await t.pauseService.pause({
        userId: USER,
        childId: CHILD,
        ingredientIds: ['ing_x', 'ing_x'],
        reason: 'urgent',
      }),
    ).toEqual([{ id: 'ing_x', name: 'ing_x' }]);
    expect(t.events.published).toEqual([
      {
        type: 'IngredientsPaused',
        childId: CHILD,
        userId: USER,
        ingredientIds: ['ing_x'],
        sourceMealId: null,
      },
    ]);
  });
});
