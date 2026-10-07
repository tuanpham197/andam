import fc from 'fast-check';
import { exclusionReason, summarizeExclusions, type ExclusionReason } from './safety-filter.js';
import {
  contextFixture,
  dishFixture,
  ingredientsFixture,
} from '../../../../test/fakes/meal-planning-fixtures.js';

const TODAY = '2026-09-24';

describe('exclusionReason (BR-01..07)', () => {
  it('TC-SAF-001 keeps a dish that breaks no rule', () => {
    expect(exclusionReason(dishFixture(), contextFixture(), TODAY)).toBeNull();
  });

  it.each<[string, Parameters<typeof contextFixture>[0], ExclusionReason]>([
    ['TC-SAF-002 an avoided allergen', { avoidAllergens: new Set(['fish']) }, 'allergen'],
    ['TC-SAF-003 an avoided ingredient', { avoidIngredients: new Set(['ing_rau_ngot']) }, 'avoid'],
    ['TC-SAF-004 a paused ingredient', { paused: new Set(['ing_rau_ngot']) }, 'paused'],
    ['TC-SAF-005 a stage the dish does not support', { stage: 4 }, 'age'],
  ])('excludes %s', (_label, overrides, reason) => {
    expect(exclusionReason(dishFixture(), contextFixture(overrides), TODAY)).toBe(reason);
  });

  it('TC-SAF-006/011 excludes an ingredient for older babies until the exact month', () => {
    const ingredients = ingredientsFixture();
    ingredients.set('ing_ca_hoi', { ...ingredients.get('ing_ca_hoi')!, minAgeMonths: 12 });
    expect(
      exclusionReason(dishFixture(), contextFixture({ ingredients, ageMonths: 11 }), TODAY),
    ).toBe('age');
    expect(
      exclusionReason(
        dishFixture({ stages: [2, 4] }),
        contextFixture({ ingredients, ageMonths: 12, stage: 4 }),
        TODAY,
      ),
    ).toBeNull();
  });

  describe('TC-SAF-007/012/013 refused dishes', () => {
    const refusedOn = (date: string, liking = 1) =>
      contextFixture({ feedback: new Map([['dish_chao', { liking, amount: 'none', date }]]) });

    it.each([
      ['29 days ago', '2026-08-26', 'refused'],
      ['30 days ago', '2026-08-25', 'refused'],
      ['31 days ago', '2026-08-24', null],
    ])('a refusal %s → %s', (_label, date, expected) => {
      expect(exclusionReason(dishFixture(), refusedOn(date), TODAY)).toBe(expected);
    });

    it('keeps a dish whose latest feedback is positive', () => {
      expect(exclusionReason(dishFixture(), refusedOn('2026-09-20', 4), TODAY)).toBeNull();
    });
  });

  describe('TC-SAF-008/015 no new foods while sick or recovering (BR-07, BR-52/53)', () => {
    it.each(['sick', 'recovering'] as const)(
      'excludes a dish with an untried food while %s',
      (health) => {
        expect(
          exclusionReason(dishFixture(), contextFixture({ health, tried: new Set() }), TODAY),
        ).toBe('sick_new');
      },
    );

    it('keeps a dish whose foods were all tried', () => {
      const tried = new Set(['ing_ca_hoi', 'ing_rau_ngot']);
      expect(
        exclusionReason(dishFixture(), contextFixture({ health: 'sick', tried }), TODAY),
      ).toBeNull();
    });

    it('does not count staples (rice, oil) as new foods', () => {
      const tried = new Set(['ing_ca_hoi', 'ing_rau_ngot']);
      expect(tried.has('ing_gao')).toBe(false);
      expect(
        exclusionReason(dishFixture(), contextFixture({ health: 'sick', tried }), TODAY),
      ).toBeNull();
    });
  });

  it('TC-SAF-009/010 reports only the highest-priority reason when several apply', () => {
    const ctx = contextFixture({
      avoidAllergens: new Set(['fish']),
      avoidIngredients: new Set(['ing_rau_ngot']),
      paused: new Set(['ing_rau_ngot']),
      stage: 4,
      health: 'sick',
      tried: new Set(),
      feedback: new Map([['dish_chao', { liking: 1, amount: 'none', date: TODAY }]]),
    });
    expect(exclusionReason(dishFixture(), ctx, TODAY)).toBe('allergen');
    expect(exclusionReason(dishFixture(), { ...ctx, avoidAllergens: new Set() }, TODAY)).toBe(
      'avoid',
    );
    expect(
      exclusionReason(
        dishFixture(),
        { ...ctx, avoidAllergens: new Set(), avoidIngredients: new Set() },
        TODAY,
      ),
    ).toBe('paused');
  });

  it('TC-SAF-016 excludes when any tag of any ingredient is avoided', () => {
    const ingredients = ingredientsFixture();
    ingredients.set('ing_rau_ngot', {
      ...ingredients.get('ing_rau_ngot')!,
      allergenTags: ['sesame', 'soy'],
    });
    expect(
      exclusionReason(
        dishFixture(),
        contextFixture({ ingredients, avoidAllergens: new Set(['soy']) }),
        TODAY,
      ),
    ).toBe('allergen');
  });

  it('TC-SAF-017 does not infer one allergen from another (fish is not shellfish)', () => {
    expect(
      exclusionReason(
        dishFixture(),
        contextFixture({ avoidAllergens: new Set(['shellfish']) }),
        TODAY,
      ),
    ).toBeNull();
  });

  it('treats an ingredient missing from the catalog as unsafe', () => {
    expect(
      exclusionReason(dishFixture({ ingredientIds: ['ing_bien_mat'] }), contextFixture(), TODAY),
    ).toBe('age');
  });

  it('TC-SAF-018 never keeps a dish containing an avoided allergen, ingredient or paused food', () => {
    const ids = ['ing_gao', 'ing_ca_hoi', 'ing_rau_ngot', 'ing_dau'];
    const allergens = ['fish', 'egg', 'soy', 'peanut'] as const;
    fc.assert(
      fc.property(
        fc.subarray(ids, { minLength: 1 }),
        fc.subarray([...allergens]),
        fc.subarray(ids),
        fc.subarray(ids),
        (dishIngredients, avoidAllergens, avoidIngredients, paused) => {
          const ctx = contextFixture({
            avoidAllergens: new Set(avoidAllergens),
            avoidIngredients: new Set(avoidIngredients),
            paused: new Set(paused),
          });
          const dish = dishFixture({ ingredientIds: dishIngredients });
          if (exclusionReason(dish, ctx, TODAY) !== null) return true;
          return dishIngredients.every((id) => {
            const ingredient = ctx.ingredients.get(id)!;
            return (
              !avoidIngredients.includes(id) &&
              !paused.includes(id) &&
              ingredient.allergenTags.every((tag) => !avoidAllergens.includes(tag as never))
            );
          });
        },
      ),
      { numRuns: 1000 },
    );
  });
});

describe('summarizeExclusions', () => {
  it('counts each excluded dish once under its reason', () => {
    expect(summarizeExclusions(['allergen', 'allergen', 'age', null, 'refused', null])).toEqual({
      total: 4,
      byReason: { allergen: 2, avoid: 0, paused: 0, age: 1, refused: 1, sick_new: 0 },
    });
  });
});
