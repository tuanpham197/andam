import { Global, Module } from '@nestjs/common';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsModule } from 'nestjs-cls';
import { UNIT_OF_WORK } from '../../kernel/unit-of-work.port.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClsUnitOfWork } from './cls-unit-of-work.js';

@Global()
@Module({
  imports: [
    PrismaModule,
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
      plugins: [
        new ClsPluginTransactional({
          imports: [PrismaModule],
          adapter: new TransactionalAdapterPrisma({ prismaInjectionToken: PrismaService }),
        }),
      ],
    }),
  ],
  providers: [{ provide: UNIT_OF_WORK, useClass: ClsUnitOfWork }],
  exports: [UNIT_OF_WORK, PrismaModule],
})
export class PersistenceModule {}
