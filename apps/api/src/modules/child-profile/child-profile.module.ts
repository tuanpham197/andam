import { Module } from '@nestjs/common';
import { ENV } from '../../shared/infrastructure/config/config.module.js';
import type { Env } from '../../shared/infrastructure/config/env.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ChildrenController } from './adapters/in/http/children.controller.js';
import { InvitesController, MembersController } from './adapters/in/http/members.controller.js';
import { CatalogIngredientLookup } from './adapters/out/cross-module/catalog-ingredient-lookup.js';
import { PrismaChildRepository } from './adapters/out/persistence/prisma-child.repository.js';
import { PrismaInviteRepository } from './adapters/out/persistence/prisma-invite.repository.js';
import { PrismaMembershipRepository } from './adapters/out/persistence/prisma-membership.repository.js';
import { NodeInviteTokens } from './adapters/out/security/node-invite-tokens.js';
import { CHILD_REPOSITORY } from './application/ports/out/child.repository.js';
import { INGREDIENT_LOOKUP } from './application/ports/out/ingredient-lookup.port.js';
import { INVITE_REPOSITORY } from './application/ports/out/invite.repository.js';
import { INVITE_SETTINGS, INVITE_TOKENS } from './application/ports/out/invite-tokens.port.js';
import { MEMBERSHIP_REPOSITORY } from './application/ports/out/membership.repository.js';
import { ChildAccessService } from './application/use-cases/child-access.service.js';
import { ChildProfileService } from './application/use-cases/child-profile.service.js';
import { MembersService } from './application/use-cases/members.service.js';

@Module({
  imports: [CatalogModule],
  controllers: [ChildrenController, MembersController, InvitesController],
  providers: [
    ChildProfileService,
    ChildAccessService,
    MembersService,
    { provide: CHILD_REPOSITORY, useClass: PrismaChildRepository },
    { provide: INGREDIENT_LOOKUP, useClass: CatalogIngredientLookup },
    { provide: MEMBERSHIP_REPOSITORY, useClass: PrismaMembershipRepository },
    { provide: INVITE_REPOSITORY, useClass: PrismaInviteRepository },
    { provide: INVITE_TOKENS, useClass: NodeInviteTokens },
    {
      provide: INVITE_SETTINGS,
      inject: [ENV],
      useFactory: (env: Env) => ({ webBaseUrl: env.WEB_BASE_URL }),
    },
  ],
  // ChildAccessService: other modules ask it who may do what (BR-73); MembersService: account deletion.
  exports: [
    CHILD_REPOSITORY,
    INGREDIENT_LOOKUP,
    ChildProfileService,
    ChildAccessService,
    MembersService,
  ],
})
export class ChildProfileModule {}
