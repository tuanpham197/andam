import type { CatalogReader, IngredientView } from '../ports/out/catalog.reader.js';
import { InvalidSearchQueryError } from '../../domain/errors.js';
import { ListStagesService, SEARCH_LIMIT, SearchIngredientsService } from './catalog-queries.js';

class FakeReader implements CatalogReader {
  calls: [string, number][] = [];
  async listStages() {
    return [
      {
        id: 1,
        name: 'Giai đoạn 1',
        ageFromMonths: 6,
        ageToMonths: 8,
        texture: 'puree_smooth',
        portionText: 'x',
        mainMeals: 2,
        snacksMin: 0,
        snacksMax: 0,
      },
    ];
  }
  async findIngredientsByIds() {
    return [];
  }
  async listDishes() {
    return [];
  }
  async listIngredients() {
    return [];
  }
  async stageSchedule() {
    return { mainMeals: 0, snacksMin: 0, schedule: [] };
  }
  async recipe() {
    return null;
  }
  async searchIngredients(searchText: string, limit: number): Promise<IngredientView[]> {
    this.calls.push([searchText, limit]);
    return [
      { id: 'ing_ca_rot', name: 'Cà rốt', foodGroup: 'veg', proteinSource: null, allergenTags: [] },
    ];
  }
}

describe('SearchIngredientsService', () => {
  it('searches with the accent-free form of the query and the fixed limit of 20', async () => {
    const reader = new FakeReader();
    const result = await new SearchIngredientsService(reader).execute({ q: '  CÀ   RỐT ' });
    expect(reader.calls).toEqual([['ca rot', 20]]);
    expect(SEARCH_LIMIT).toBe(20);
    expect(result).toHaveLength(1);
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '   \t'],
    ['zero-width only', '\u200B'],
    ['101 characters', 'a'.repeat(101)],
  ])('TC-ING-003 rejects a %s query', async (_label, q) => {
    const reader = new FakeReader();
    await expect(new SearchIngredientsService(reader).execute({ q })).rejects.toThrow(
      InvalidSearchQueryError,
    );
    expect(reader.calls).toHaveLength(0);
  });

  it.each([
    ['1 character', 'c'],
    ['100 characters', 'a'.repeat(100)],
  ])('accepts a %s query', async (_label, q) => {
    await expect(
      new SearchIngredientsService(new FakeReader()).execute({ q }),
    ).resolves.toHaveLength(1);
  });

  it('exposes INVALID_SEARCH_QUERY as invalid input', () => {
    expect(new InvalidSearchQueryError()).toMatchObject({
      code: 'INVALID_SEARCH_QUERY',
      kind: 'invalid_input',
    });
  });
});

describe('ListStagesService', () => {
  it('returns the stages from the catalog', async () => {
    await expect(new ListStagesService(new FakeReader()).execute()).resolves.toEqual([
      expect.objectContaining({ id: 1, mainMeals: 2 }),
    ]);
  });
});
