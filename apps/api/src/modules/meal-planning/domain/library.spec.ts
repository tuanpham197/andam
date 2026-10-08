import { addDays } from '../../../shared/kernel/local-date.js';
import { catalogContext } from '../../../../test/fakes/meal-planning-fixtures.js';
import { filterLibrary, LIBRARY_CHIPS, type LibraryRequest } from './library.js';
import type { PlanningContext } from './model.js';

const TODAY = '2026-09-24';

const request = (overrides: Partial<LibraryRequest> = {}): LibraryRequest => ({
  today: TODAY,
  query: '',
  chip: 'all',
  fresh: false,
  eaten: [],
  ...overrides,
});

/** Readable names so search can be tested: "Cháo gà bí đỏ", "Cháo cá hồi"… */
function named(): PlanningContext {
  const base = catalogContext();
  const names: Record<string, string> = {
    dish_ca_0: 'Cháo cá hồi rau ngót',
    dish_ga_0: 'Cháo thịt gà bí đỏ',
    dish_trung_0: 'Cháo trứng cà rốt',
  };
  const ingredients = new Map(base.ingredients);
  ingredients.set('ing_bi', { ...ingredients.get('ing_bi')!, name: 'Bí đỏ' });
  return catalogContext({
    ingredients,
    dishes: base.dishes.map((d) => ({ ...d, name: names[d.id] ?? d.name })),
  });
}

const ids = (result: ReturnType<typeof filterLibrary>) => result.dishes.map((e) => e.dish.id);

describe('filterLibrary (UC-07)', () => {
  it('lists every safe dish for the child, sorted by name, with the stage texture', () => {
    const ctx = catalogContext();
    const result = filterLibrary(ctx, request());
    expect(result.dishes).toHaveLength(ctx.dishes.length);
    const names = result.dishes.map((e) => e.dish.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'vi')));
    expect(result.dishes[0]!.texture).toBe('lumpy');
    expect(result.hidden.total).toBe(0);
  });

  it('hides unsafe dishes and says how many and why (FR-050)', () => {
    const ctx = catalogContext({ avoidAllergens: new Set(['egg']), paused: new Set(['ing_le']) });
    const result = filterLibrary(ctx, request());
    expect(ids(result).some((id) => id.startsWith('dish_trung'))).toBe(false);
    expect(result.hidden.total).toBe(4);
    expect(result.hidden.byReason).toMatchObject({ allergen: 3, paused: 1 });
    expect(result.hidden.items).toContainEqual({ dishId: 'dish_snack_le', reason: 'paused' });
  });

  describe('chips (FR-047)', () => {
    it.each([
      ['chicken', 'chicken'],
      ['fish', 'fish'],
      ['beef', 'beef'],
      ['pork', 'pork'],
      ['legume', 'legume'],
    ] as const)('%s keeps main dishes of that protein', (chip, protein) => {
      const result = filterLibrary(catalogContext(), request({ chip }));
      expect(result.dishes).toHaveLength(3);
      for (const e of result.dishes) {
        expect(e.dish.mainProtein).toBe(protein);
        expect(e.dish.mealType).toBe('main');
      }
    });

    it('snack keeps snacks only', () => {
      const result = filterLibrary(catalogContext(), request({ chip: 'snack' }));
      expect(ids(result).every((id) => id.startsWith('dish_snack'))).toBe(true);
      expect(result.dishes).toHaveLength(4);
    });

    it('offers the chips of the design, egg dishes only under "all"', () => {
      expect(LIBRARY_CHIPS).toEqual([
        'all',
        'chicken',
        'fish',
        'beef',
        'pork',
        'legume',
        'snack',
        'custom',
      ]);
    });
  });

  describe('search (FR-046)', () => {
    it('matches the dish name without accents or case', () => {
      expect(ids(filterLibrary(named(), request({ query: 'CHAO CA HOI' })))).toEqual(['dish_ca_0']);
    });

    it('TC-LIB-007 matches an ingredient name; finished words whole, the last one as a prefix', () => {
      const result = filterLibrary(named(), request({ query: 'bi do' }));
      // "Bí đỏ" is in every dish built on ing_bi (one per protein), and in "Cháo thịt gà bí đỏ".
      expect(result.dishes.length).toBeGreaterThan(1);
      expect(ids(result)).toContain('dish_ga_0');
      // "ga" must not match "gao" (gạo, in every porridge) once the word is finished.
      expect(ids(filterLibrary(named(), request({ query: 'ga  bi' })))).toEqual(['dish_ga_0']);
      // A finished word alone: chicken dishes, not every dish cooked with rice.
      expect(
        filterLibrary(named(), request({ query: 'gà' })).dishes.every(
          (e) => e.dish.mainProtein === 'chicken',
        ),
      ).toBe(true);
      // While typing, the last word is a prefix: "ch" already finds the porridges.
      expect(filterLibrary(named(), request({ query: 'ch' })).dishes.length).toBeGreaterThan(1);
    });

    it('TC-LIB-006 honours accents when the parent types them: "bò" is not "bơ"', () => {
      const base = named();
      const ctx = catalogContext({
        ingredients: base.ingredients,
        dishes: base.dishes.map((d) =>
          d.id === 'dish_bo_0'
            ? { ...d, name: 'Cháo bò bí đỏ' }
            : d.id === 'dish_snack_bo_qua'
              ? { ...d, name: 'Bơ chuối nghiền' }
              : d,
        ),
      });
      const beef = ['dish_bo_0', 'dish_bo_1', 'dish_bo_2'];
      // The beef ingredient itself is "Bò", so every beef dish matches.
      expect(ids(filterLibrary(ctx, request({ query: 'bò' }))).sort()).toEqual(beef);
      expect(ids(filterLibrary(ctx, request({ query: 'bơ' })))).toEqual(['dish_snack_bo_qua']);
      // Without accents both are "bo".
      expect(ids(filterLibrary(ctx, request({ query: 'bo' }))).sort()).toEqual([
        ...beef,
        'dish_snack_bo_qua',
      ]);
      // Accents typed but nothing spelled that way: fall back to the accent-free reading.
      expect(ids(filterLibrary(ctx, request({ query: 'bố' }))).sort()).toEqual([
        ...beef,
        'dish_snack_bo_qua',
      ]);
    });

    it('reads several words while the last one is still being typed', () => {
      // "cháo cá h…": the finished words match whole, "h" as the start of "hồi".
      expect(ids(filterLibrary(named(), request({ query: 'cháo cá h' })))).toEqual(['dish_ca_0']);
    });

    it('survives a dish whose ingredient is missing from the catalog, keeping it hidden', () => {
      const base = named();
      const broken = {
        ...base.dishes[0]!,
        id: 'dish_hong',
        name: 'Cháo hỏng',
        ingredientIds: ['ing_khong_co'],
      };
      const ctx = catalogContext({
        ingredients: base.ingredients,
        dishes: [...base.dishes, broken],
      });
      const result = filterLibrary(ctx, request({ query: 'chao hong' }));
      expect(result.dishes).toEqual([]);
      expect(result.hidden.items).toEqual([{ dishId: 'dish_hong', reason: 'age' }]);
    });

    it('finds nothing when no reading matches', () => {
      expect(filterLibrary(named(), request({ query: 'pizza' })).dishes).toEqual([]);
    });

    it('treats a blank query as no query', () => {
      expect(filterLibrary(named(), request({ query: '   ' })).dishes).toHaveLength(
        named().dishes.length,
      );
    });

    it('TC-LIB-003 a word matching only a hidden dish: nothing shown, the hidden one explained', () => {
      const ctx = { ...named(), avoidAllergens: new Set(['egg'] as const) };
      const result = filterLibrary(ctx, request({ query: 'trứng cà rốt' }));
      expect(result.dishes).toEqual([]);
      expect(result.hidden).toEqual({
        total: 1,
        byReason: { allergen: 1, avoid: 0, paused: 0, age: 0, refused: 0, sick_new: 0 },
        items: [{ dishId: 'dish_trung_0', reason: 'allergen' }],
      });
    });
  });

  describe('recently eaten (FR-048/049)', () => {
    const eaten = [
      { date: TODAY, slot: 'breakfast' as const, dishId: 'dish_snack_chuoi' },
      { date: addDays(TODAY, -2), slot: 'lunch' as const, dishId: 'dish_ca_0' },
      { date: addDays(TODAY, -5), slot: 'dinner' as const, dishId: 'dish_ca_0' },
      { date: addDays(TODAY, -8), slot: 'lunch' as const, dishId: 'dish_ga_0' },
    ];

    it('tags the latest meal within 7 days, with its slot', () => {
      const result = filterLibrary(catalogContext(), request({ eaten }));
      const tag = (id: string) => result.dishes.find((e) => e.dish.id === id)!.lastEaten;
      expect(tag('dish_snack_chuoi')).toEqual({ daysAgo: 0, slot: 'breakfast' });
      expect(tag('dish_ca_0')).toEqual({ daysAgo: 2, slot: 'lunch' });
      expect(tag('dish_ga_0')).toBeNull();
    });

    it('"Chưa ăn 7 ngày" leaves those out, and only those', () => {
      const result = filterLibrary(catalogContext(), request({ eaten, fresh: true }));
      expect(ids(result)).not.toContain('dish_snack_chuoi');
      expect(ids(result)).not.toContain('dish_ca_0');
      expect(ids(result)).toContain('dish_ga_0');
      expect(result.dishes).toHaveLength(catalogContext().dishes.length - 2);
    });

    it('TC-LIB-001 combines search, chip and "Chưa ăn 7 ngày" as an intersection', () => {
      const result = filterLibrary(
        named(),
        request({ query: 'chao', chip: 'fish', fresh: true, eaten }),
      );
      expect(ids(result).sort()).toEqual(['dish_ca_1', 'dish_ca_2']);
    });

    it('does not let "Chưa ăn 7 ngày" touch the hidden summary', () => {
      const ctx = catalogContext({ avoidAllergens: new Set(['egg']) });
      const hidden = (fresh: boolean) => filterLibrary(ctx, request({ eaten, fresh })).hidden.total;
      expect(hidden(true)).toBe(hidden(false));
    });
  });

  it('TC-LIB-004 marks first tries and liked dishes alongside the recent tag', () => {
    const ctx = catalogContext({
      tried: new Set(['ing_gao', 'ing_dau_an', 'ing_bi']),
      feedback: new Map([['dish_ga_0', { liking: 5, amount: 'half', date: addDays(TODAY, -2) }]]),
    });
    const result = filterLibrary(
      ctx,
      request({ eaten: [{ date: addDays(TODAY, -2), slot: 'lunch', dishId: 'dish_ga_0' }] }),
    );
    const ga = result.dishes.find((e) => e.dish.id === 'dish_ga_0')!;
    expect(ga).toMatchObject({
      newIngredientIds: ['ing_ga'],
      liked: true,
      lastEaten: { daysAgo: 2, slot: 'lunch' },
    });
    expect(result.dishes.find((e) => e.dish.id === 'dish_bo_0')!.liked).toBe(false);
  });
});

describe('"Món của bạn" in the library (FR-133/134, BR-86)', () => {
  const withCustom = (): PlanningContext => {
    const base = catalogContext();
    return {
      ...base,
      dishes: base.dishes.map((d) =>
        d.id === 'dish_ga_0'
          ? { ...d, custom: true }
          : d.id === 'dish_ga_1'
            ? { ...d, custom: true, archived: true }
            : d,
      ),
    };
  };

  it('TC-CUS-009 the "custom" chip lists only the parents’ dishes still in use', () => {
    const result = filterLibrary(withCustom(), request({ chip: 'custom' }));
    expect(result.dishes.map((e) => e.dish.id)).toEqual(['dish_ga_0']);
  });

  it('TC-CUS-013 a deleted dish is neither shown nor counted as hidden', () => {
    const result = filterLibrary(withCustom(), request());
    expect(result.dishes.map((e) => e.dish.id)).not.toContain('dish_ga_1');
    expect(result.hidden.items.map((i) => i.dishId)).not.toContain('dish_ga_1');
  });
});
