import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ChildrenController } from './adapters/in/http/children.controller.js';
import { CatalogIngredientLookup } from './adapters/out/cross-module/catalog-ingredient-lookup.js';
import { PrismaChildRepository } from './adapters/out/persistence/prisma-child.repository.js';
import { CHILD_REPOSITORY } from './application/ports/out/child.repository.js';
import { INGREDIENT_LOOKUP } from './application/ports/out/ingredient-lookup.port.js';
import { ChildProfileService } from './application/use-cases/child-profile.service.js';

@Module({
  imports: [CatalogModule],
  controllers: [ChildrenController],
  providers: [
    ChildProfileService,
    { provide: CHILD_REPOSITORY, useClass: PrismaChildRepository },
    { provide: INGREDIENT_LOOKUP, useClass: CatalogIngredientLookup },
  ],
  exports: [CHILD_REPOSITORY, INGREDIENT_LOOKUP, ChildProfileService],
})
export class ChildProfileModule {}
