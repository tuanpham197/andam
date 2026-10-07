import { Module } from '@nestjs/common';
import { CatalogController } from './adapters/in/http/catalog.controller.js';
import { PrismaCatalogReader } from './adapters/out/persistence/prisma-catalog.reader.js';
import { CATALOG_READER } from './application/ports/out/catalog.reader.js';
import {
  ListStagesService,
  SearchIngredientsService,
} from './application/use-cases/catalog-queries.js';

@Module({
  controllers: [CatalogController],
  providers: [
    ListStagesService,
    SearchIngredientsService,
    { provide: CATALOG_READER, useClass: PrismaCatalogReader },
  ],
  exports: [CATALOG_READER],
})
export class CatalogModule {}
