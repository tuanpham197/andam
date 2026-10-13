import {
  ChildNotPlannableError,
  DishNotForSlotError,
  DishNotSafeError,
  MealAlreadyLoggedError,
  MealInPastError,
  SameDishError,
} from './errors.js';
import { PlannedMeal } from './planned-meal.js';

const meal = (status: Parameters<typeof PlannedMeal.restore>[0]['status'] = 'planned') =>
  PlannedMeal.restore({
    id: 'm-1',
    childId: 'c-1',
    date: '2026-09-24',
    slot: 'lunch',
    time: '11:00',
    dishId: 'dish_chao',
    stageId: 2,
    texture: 'lumpy',
    portionText: '120–150 ml',
    status,
    newIngredientIds: ['ing_rau_ngot'],
    source: 'auto',
    generatedAt: new Date('2026-09-24T00:00:00Z'),
  });

describe('PlannedMeal', () => {
  it('is created from an engine draft as a planned, automatic meal', () => {
    const created = PlannedMeal.plan({
      id: 'm-2',
      childId: 'c-1',
      date: '2026-09-24',
      stageId: 2,
      generatedAt: new Date('2026-09-24T01:00:00Z'),
      draft: {
        slot: 'dinner',
        time: '18:00',
        dishId: 'dish_ga',
        texture: 'lumpy',
        portionText: '125 ml',
        newIngredientIds: [],
        newAllergenIds: [],
        reasons: [],
      },
    });
    expect(created).toMatchObject({
      status: 'planned',
      source: 'auto',
      slot: 'dinner',
      dishId: 'dish_ga',
      isPending: true,
    });
  });

  it('FR-025 marks a planned meal as prepared, idempotently (TC-PLN-005)', () => {
    const m = meal();
    m.markPrepared();
    m.markPrepared();
    expect(m.status).toBe('prepared');
  });

  it.each(['eaten', 'refused'] as const)(
    'TC-PLN-004 refuses to prepare a meal already %s',
    (status) => {
      expect(() => meal(status).markPrepared()).toThrow(MealAlreadyLoggedError);
    },
  );

  it('can prepare a meal that had been skipped', () => {
    const m = meal('skipped');
    m.markPrepared();
    expect(m.status).toBe('prepared');
  });

  it.each([
    ['planned', true],
    ['prepared', true],
    ['eaten', false],
    ['refused', false],
    ['skipped', false],
  ] as const)('a %s meal is pending=%s', (status, pending) => {
    expect(meal(status).isPending).toBe(pending);
  });

  it('exposes MEAL_ALREADY_LOGGED as a conflict', () => {
    expect(new MealAlreadyLoggedError()).toMatchObject({
      code: 'MEAL_ALREADY_LOGGED',
      kind: 'conflict',
    });
  });
});

describe('PlannedMeal.swapTo (FR-045)', () => {
  const target = {
    dishId: 'dish_bo',
    texture: 'lumpy' as const,
    portionText: 'Khoảng 125 ml',
    newIngredientIds: ['ing_bo'],
  };

  it('takes the new dish with its stage variant and first tries, as a swap', () => {
    const m = meal();
    m.swapTo(target);
    expect(m).toMatchObject({ ...target, source: 'swap', status: 'planned' });
  });

  it('puts a prepared meal back to planned: the new dish is not cooked yet', () => {
    const m = meal('prepared');
    m.swapTo(target);
    expect(m.status).toBe('planned');
  });

  it.each(['eaten', 'refused'] as const)('refuses a %s meal (TC-SWP-006)', (status) => {
    expect(() => meal(status).swapTo(target)).toThrow(MealAlreadyLoggedError);
  });

  it('refuses the dish it already has (TC-SWP-007)', () => {
    const error = (() => {
      try {
        meal().swapTo({ ...target, dishId: 'dish_chao' });
      } catch (e) {
        return e as SameDishError;
      }
    })();
    expect(error).toBeInstanceOf(SameDishError);
    expect(error).toMatchObject({ code: 'SAME_DISH', kind: 'rule_violation' });
  });
});

describe('swap errors', () => {
  it.each([
    [new MealInPastError(), 'MEAL_IN_PAST', 'rule_violation'],
    [new DishNotSafeError('allergen'), 'DISH_NOT_SAFE_FOR_CHILD', 'rule_violation'],
    [new DishNotForSlotError(), 'DISH_NOT_FOR_SLOT', 'rule_violation'],
    [new ChildNotPlannableError(), 'CHILD_NOT_PLANNABLE', 'rule_violation'],
  ])('%s', (error, code, kind) => {
    expect(error).toMatchObject({ code, kind });
  });

  it('says why a dish is not safe', () => {
    expect(new DishNotSafeError('paused').reason).toBe('paused');
    expect(new DishNotSafeError('paused').details).toEqual({ reason: 'paused' });
  });
});

describe('PlannedMeal.markLogged (UC-08)', () => {
  it.each(['planned', 'prepared'] as const)('closes a %s meal as eaten or refused', (status) => {
    const eaten = meal(status);
    eaten.markLogged('eaten');
    expect(eaten.status).toBe('eaten');
    const refused = meal(status);
    refused.markLogged('refused');
    expect(refused.status).toBe('refused');
  });

  it.each(['eaten', 'refused', 'skipped'] as const)('refuses to log a %s meal again', (status) => {
    expect(() => meal(status).markLogged('eaten')).toThrow(MealAlreadyLoggedError);
  });
});

describe('PlannedMeal.updateNewIngredients (BR-86)', () => {
  it('replaces the first tries with a copy of the given list', () => {
    const m = meal();
    const ids = ['ing_ga'];
    m.updateNewIngredients(ids);
    ids.push('ing_bi');
    expect(m.newIngredientIds).toEqual(['ing_ga']);
  });

  it('is served again for the current health, keeping its dish (BR-50..53)', () => {
    const m = meal();
    m.reserve({ texture: 'mashed', portionText: 'Khoảng 90 ml' });
    expect([m.dishId, m.texture, m.portionText]).toEqual(['dish_chao', 'mashed', 'Khoảng 90 ml']);
    expect(() => meal('eaten').reserve({ texture: 'mashed', portionText: 'x' })).toThrow(
      MealAlreadyLoggedError,
    );
  });

  describe('reasons and replan cause (BR-93/94)', () => {
    const draft = {
      slot: 'dinner' as const,
      time: '18:00',
      dishId: 'dish_ga',
      texture: 'lumpy' as const,
      portionText: '120–150 ml',
      newIngredientIds: [],
      newAllergenIds: [],
      reasons: ['NEW_INGREDIENT', 'FOUR_GROUPS', 'LIKED', 'NOT_USED_7D'] as const,
    };
    const planned = (replanCause?: 'health') =>
      PlannedMeal.plan({
        id: 'm-3',
        childId: 'c-1',
        date: '2026-09-24',
        stageId: 2,
        generatedAt: new Date('2026-09-24T01:00:00Z'),
        draft: { ...draft, reasons: [...draft.reasons] },
        replanCause,
      });

    it('TC-UX-007 keeps 3 engine reasons in display order', () => {
      expect(planned().reasons).toEqual(['NOT_USED_7D', 'LIKED', 'FOUR_GROUPS']);
      expect(planned().replanCause).toBeNull();
      expect(planned('health').replanCause).toBe('health');
    });

    it('reads rows written before P8a as no reasons and no cause', () => {
      expect([meal().reasons, meal().replanCause]).toEqual([[], null]);
    });

    it('TC-UX-010 a swap is the parent’s choice: no reasons, no notice', () => {
      const m = planned('health');
      m.swapTo({ dishId: 'dish_bo', texture: 'lumpy', portionText: 'x', newIngredientIds: [] });
      expect([m.reasons, m.replanCause]).toEqual([[], null]);
    });

    it('a re-served meal takes the cause given, and keeps its own without one', () => {
      const m = planned();
      m.reserve({ texture: 'mashed', portionText: 'y' });
      expect(m.replanCause).toBeNull();
      m.reserve({ texture: 'mashed', portionText: 'y' }, 'health');
      expect(m.replanCause).toBe('health');
    });
  });
});
