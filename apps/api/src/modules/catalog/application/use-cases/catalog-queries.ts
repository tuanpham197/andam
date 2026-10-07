import { Inject, Injectable } from '@nestjs/common';
import { InvalidSearchQueryError } from '../../domain/errors.js';
import { toSearchText } from '../../../../shared/kernel/search-text.js';
import {
  CATALOG_READER,
  type CatalogReader,
  type IngredientView,
  type StageView,
} from '../ports/out/catalog.reader.js';

export const SEARCH_LIMIT = 20;
const MAX_QUERY_LENGTH = 100;

@Injectable()
export class SearchIngredientsService {
  constructor(@Inject(CATALOG_READER) private readonly catalog: CatalogReader) {}

  async execute(input: { q: string }): Promise<IngredientView[]> {
    const searchText = toSearchText(input.q);
    if (searchText.length === 0 || searchText.length > MAX_QUERY_LENGTH) {
      throw new InvalidSearchQueryError();
    }
    return this.catalog.searchIngredients(searchText, SEARCH_LIMIT);
  }
}

@Injectable()
export class ListStagesService {
  constructor(@Inject(CATALOG_READER) private readonly catalog: CatalogReader) {}

  execute(): Promise<StageView[]> {
    return this.catalog.listStages();
  }
}
