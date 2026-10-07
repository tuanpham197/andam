import { Inject, Injectable } from '@nestjs/common';
import {
  CATALOG_READER,
  type CatalogReader,
} from '../../../../catalog/application/ports/out/catalog.reader.js';
import type { IngredientLookup } from '../../../application/ports/out/ingredient-lookup.port.js';

/** Anti-corruption layer: child-profile asks the catalog module instead of reading its tables. */
@Injectable()
export class CatalogIngredientLookup implements IngredientLookup {
  constructor(@Inject(CATALOG_READER) private readonly catalog: CatalogReader) {}

  findByIds(ids: string[]): Promise<{ id: string; name: string }[]> {
    return this.catalog.findIngredientsByIds(ids);
  }
}
