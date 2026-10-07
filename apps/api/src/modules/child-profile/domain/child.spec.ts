import { Child, type CreateChildInput } from './child.js';
import {
  ChildNotPlannableError,
  ChildTooOldError,
  InvalidBirthDateError,
  InvalidChildNameError,
  InvalidPriorReactionNoteError,
  InvalidStageError,
  InvalidWeeksEarlyError,
  StageAboveAgeError,
  TooManyAvoidItemsError,
} from './errors.js';

const TODAY = '2026-09-24';

function input(overrides: Partial<CreateChildInput> = {}): CreateChildInput {
  return {
    id: 'c-1',
    userId: 'u-1',
    name: 'Na',
    birthDate: '2026-01-12',
    isPremature: false,
    weeksEarly: 0,
    priorReaction: 'never',
    priorReactionNote: null,
    avoidAllergens: ['egg'],
    avoidIngredients: [{ ingredientId: 'ing_muop_dang', reason: 'dislike' }],
    ...overrides,
  };
}

const CREATED_AT = new Date('2026-09-24T02:00:00Z');
const create = (overrides: Partial<CreateChildInput> = {}, today = TODAY) =>
  Child.create(input(overrides), today, CREATED_AT);

describe('Child.create', () => {
  it('creates bé Na from the design', () => {
    const child = create();
    expect(child.name).toBe('Na');
    expect(child.createdAt).toBe(CREATED_AT);
    expect(child.initials).toBe('Na');
    expect(child.profile(TODAY)).toEqual({
      age: { months: 8, days: 12, corrected: false },
      autoStage: 2,
      effectiveStage: 2,
      isOverride: false,
      plannable: true,
      notPlannableReason: null,
      stages: [
        { id: 1, state: 'open', unlockAtMonths: 6 },
        { id: 2, state: 'selected', unlockAtMonths: 8 },
        { id: 3, state: 'locked', unlockAtMonths: 10 },
        { id: 4, state: 'locked', unlockAtMonths: 12 },
      ],
    });
  });

  describe('TC-CHD-002..004 name', () => {
    it.each(['', '   ', '\t\n'])('rejects %j', (name) => {
      expect(() => create({ name })).toThrow(InvalidChildNameError);
    });

    it('accepts 1 and 30 characters, rejects 31', () => {
      expect(create({ name: 'A' }).name).toBe('A');
      expect(create({ name: 'a'.repeat(30) }).name).toHaveLength(30);
      expect(() => create({ name: 'a'.repeat(31) })).toThrow(InvalidChildNameError);
    });

    it('counts an emoji as one character', () => {
      expect(() => create({ name: '🍼'.repeat(30) })).not.toThrow();
      expect(() => create({ name: '🍼'.repeat(31) })).toThrow(InvalidChildNameError);
    });

    it('TC-CHD-003 stores NFC, trims and collapses inner spaces', () => {
      const child = create({ name: '  Nà   Bí  ' });
      expect(child.name).toBe('Nà Bí');
      expect(child.name).toBe('Nà Bí'.normalize('NFC'));
    });
  });

  describe('TC-CHD-004/005 initials', () => {
    it.each([
      ['Na', 'Na'],
      ['Minh Anh', 'MA'],
      ['nguyễn thị hoa', 'TH'],
      ['A', 'A'],
      ['đậu', 'Đậ'],
      ['🍼 Bi', '🍼B'],
      ['🍼', '🍼'],
    ])('%j → %j', (name, initials) => {
      expect(create({ name }).initials).toBe(initials);
    });
  });

  describe('birth date', () => {
    it.each(['2026-02-30', 'hôm qua', ''])('rejects the invalid date %j', (birthDate) => {
      expect(() => create({ birthDate })).toThrow(InvalidBirthDateError);
    });

    it('TC-AGE-011 rejects a birth date in the future', () => {
      expect(() => create({ birthDate: '2026-09-25' })).toThrow(InvalidBirthDateError);
    });

    it('accepts a baby born today', () => {
      expect(create({ birthDate: TODAY }).profile(TODAY).plannable).toBe(false);
    });

    it('TC-AGE-007 refuses a child older than 24 months', () => {
      expect(() => create({ birthDate: '2024-09-23' })).toThrow(ChildTooOldError);
      expect(create({ birthDate: '2024-09-24' }).profile(TODAY).autoStage).toBe(4);
    });

    it('TC-CHD-016 keeps a baby under 6 months but does not plan menus', () => {
      const profile = create({ birthDate: '2026-04-01' }).profile(TODAY);
      expect(profile).toMatchObject({
        autoStage: null,
        effectiveStage: null,
        plannable: false,
        notPlannableReason: 'too_young',
      });
      expect(profile.stages.every((s) => s.state === 'locked')).toBe(true);
    });
  });

  describe('premature birth', () => {
    it('TC-AGE-002 uses the corrected age and lowers the stage', () => {
      const profile = create({ isPremature: true, weeksEarly: 3 }).profile(TODAY);
      expect(profile.age).toEqual({ months: 7, days: 22, corrected: true });
      expect(profile.autoStage).toBe(1);
    });

    it.each([
      [0, true],
      [1, false],
      [16, false],
      [17, true],
      [2.5, true],
    ])('TC-AGE-014 weeksEarly %d invalid=%s', (weeksEarly, invalid) => {
      const make = () => create({ isPremature: true, weeksEarly });
      if (invalid) expect(make).toThrow(InvalidWeeksEarlyError);
      else expect(make).not.toThrow();
    });

    it('TC-AGE-007 refuses a premature child whose corrected age is still over 24 months', () => {
      expect(() => create({ birthDate: '2024-08-01', isPremature: true, weeksEarly: 2 })).toThrow(
        ChildTooOldError,
      );
    });

    it('TC-AGE-015 ignores weeksEarly when not premature', () => {
      expect(create({ isPremature: false, weeksEarly: 3 }).weeksEarly).toBe(0);
    });
  });

  describe('prior reaction', () => {
    it('keeps a trimmed note only when there was a reaction', () => {
      expect(
        create({ priorReaction: 'yes', priorReactionNote: '  nổi mẩn với trứng  ' })
          .priorReactionNote,
      ).toBe('nổi mẩn với trứng');
      expect(
        create({ priorReaction: 'never', priorReactionNote: 'x' }).priorReactionNote,
      ).toBeNull();
      expect(
        create({ priorReaction: 'yes', priorReactionNote: '   ' }).priorReactionNote,
      ).toBeNull();
    });

    it('limits the note to 500 characters', () => {
      expect(() =>
        create({ priorReaction: 'yes', priorReactionNote: 'a'.repeat(500) }),
      ).not.toThrow();
      expect(() => create({ priorReaction: 'yes', priorReactionNote: 'a'.repeat(501) })).toThrow(
        InvalidPriorReactionNoteError,
      );
    });
  });

  describe('avoid list', () => {
    it('TC-CHD-006 removes duplicate allergens', () => {
      expect(create({ avoidAllergens: ['egg', 'fish', 'egg'] }).avoidAllergens).toEqual([
        'egg',
        'fish',
      ]);
    });

    it('TC-CHD-009 keeps one entry per ingredient, "not eat" winning over "dislike"', () => {
      const child = create({
        avoidIngredients: [
          { ingredientId: 'ing_ca_rot', reason: 'dislike' },
          { ingredientId: 'ing_ca_rot', reason: 'not_eat' },
          { ingredientId: 'ing_le', reason: 'dislike' },
          { ingredientId: 'ing_le', reason: 'dislike' },
        ],
      });
      expect(child.avoidIngredients).toEqual([
        { ingredientId: 'ing_ca_rot', reason: 'not_eat' },
        { ingredientId: 'ing_le', reason: 'dislike' },
      ]);
    });

    it('TC-CHD-009 keeps "not eat" when a later duplicate says only "dislike"', () => {
      const child = create({
        avoidIngredients: [
          { ingredientId: 'ing_tom', reason: 'not_eat' },
          { ingredientId: 'ing_tom', reason: 'dislike' },
        ],
      });
      expect(child.avoidIngredients).toEqual([{ ingredientId: 'ing_tom', reason: 'not_eat' }]);
    });

    it('TC-CHD-010 accepts an empty list', () => {
      expect(create({ avoidAllergens: [], avoidIngredients: [] }).avoidIngredients).toEqual([]);
    });

    it('TC-CHD-011 accepts 100 ingredients and refuses 101', () => {
      const many = (n: number) =>
        Array.from({ length: n }, (_, i) => ({
          ingredientId: `ing_${i}`,
          reason: 'dislike' as const,
        }));
      expect(() => create({ avoidIngredients: many(100) })).not.toThrow();
      expect(() => create({ avoidIngredients: many(101) })).toThrow(TooManyAvoidItemsError);
    });

    it('can be replaced later', () => {
      const child = create();
      child.replaceAvoidList(['fish'], [{ ingredientId: 'ing_tom', reason: 'not_eat' }]);
      expect(child.avoidAllergens).toEqual(['fish']);
      expect(child.avoidIngredients).toEqual([{ ingredientId: 'ing_tom', reason: 'not_eat' }]);
    });
  });
});

describe('stage override (BR-12)', () => {
  it('TC-STG-001 allows a lower stage and flags the override', () => {
    const child = create();
    child.setStageOverride(1, TODAY);
    const profile = child.profile(TODAY);
    expect(profile).toMatchObject({ autoStage: 2, effectiveStage: 1, isOverride: true });
    expect(profile.stages.map((s) => s.state)).toEqual(['selected', 'open', 'locked', 'locked']);
  });

  it('TC-STG-002 refuses a stage above the age', () => {
    expect(() => create().setStageOverride(3, TODAY)).toThrow(StageAboveAgeError);
  });

  it('TC-STG-003 stores nothing when the chosen stage is the automatic one', () => {
    const child = create();
    child.setStageOverride(1, TODAY);
    child.setStageOverride(2, TODAY);
    expect(child.stageOverride).toBeNull();
  });

  it('clears the override with null', () => {
    const child = create();
    child.setStageOverride(1, TODAY);
    child.setStageOverride(null, TODAY);
    expect(child.profile(TODAY).isOverride).toBe(false);
  });

  it.each([0, 5, 1.5, -1])('TC-STG-004 refuses the value %d', (stage) => {
    expect(() => create().setStageOverride(stage, TODAY)).toThrow(InvalidStageError);
  });

  it('refuses an override while menus are not planned yet', () => {
    expect(() => create({ birthDate: '2026-05-01' }).setStageOverride(1, TODAY)).toThrow(
      ChildNotPlannableError,
    );
  });

  it('TC-STG-005 resets the override when premature birth is toggled', () => {
    const child = Child.create(input({ birthDate: '2025-12-01' }), TODAY, CREATED_AT);
    child.setStageOverride(1, TODAY);
    child.changeBirth({ birthDate: '2025-12-01', isPremature: true, weeksEarly: 1 }, TODAY);
    expect(child.stageOverride).toBeNull();
  });

  it('TC-STG-006 keeps a lower override while the baby grows', () => {
    const child = create();
    child.setStageOverride(1, TODAY);
    const profile = child.profile('2026-11-20');
    expect(profile).toMatchObject({ autoStage: 3, effectiveStage: 1, isOverride: true });
  });

  it('TC-STG-007 drops an override that the corrected birth date makes too high', () => {
    const child = Child.create(input({ birthDate: '2025-12-01' }), TODAY, CREATED_AT);
    child.setStageOverride(2, TODAY);
    child.changeBirth({ birthDate: '2026-02-01', isPremature: false, weeksEarly: 0 }, TODAY);
    expect(child.stageOverride).toBeNull();
    expect(child.profile(TODAY).effectiveStage).toBe(1);
  });

  it('keeps a still-valid override when the birth date is corrected', () => {
    const child = Child.create(input({ birthDate: '2025-12-01' }), TODAY, CREATED_AT);
    child.setStageOverride(1, TODAY);
    child.changeBirth({ birthDate: '2025-11-20', isPremature: false, weeksEarly: 0 }, TODAY);
    expect(child.stageOverride).toBe(1);
  });

  it('validates the new birth information', () => {
    expect(() =>
      create().changeBirth({ birthDate: '2027-01-01', isPremature: false, weeksEarly: 0 }, TODAY),
    ).toThrow(InvalidBirthDateError);
  });

  it('marks a restored override that no longer fits the age as ignored', () => {
    const child = Child.restore({ ...input(), stageOverride: 3, createdAt: new Date() });
    expect(child.profile(TODAY)).toMatchObject({ effectiveStage: 2, isOverride: false });
  });
});

describe('editing', () => {
  it('renames with the same rules', () => {
    const child = create();
    child.rename('  Bin  ');
    expect(child.name).toBe('Bin');
    expect(() => child.rename('')).toThrow(InvalidChildNameError);
  });

  it('changes the prior reaction', () => {
    const child = create();
    child.setPriorReaction('yes', 'mẩn đỏ');
    expect([child.priorReaction, child.priorReactionNote]).toEqual(['yes', 'mẩn đỏ']);
  });

  it('marks a too-old child as not plannable instead of failing', () => {
    const child = Child.restore({
      ...input({ birthDate: '2024-01-01' }),
      stageOverride: null,
      createdAt: new Date(),
    });
    expect(child.profile(TODAY)).toMatchObject({
      plannable: false,
      notPlannableReason: 'too_old',
      autoStage: null,
    });
  });
});
