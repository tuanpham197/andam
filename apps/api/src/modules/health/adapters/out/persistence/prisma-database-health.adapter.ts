import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../shared/infrastructure/prisma/prisma.service.js';
import type { DatabaseHealthPort } from '../../../application/ports/out/database-health.port.js';

@Injectable()
export class PrismaDatabaseHealthAdapter implements DatabaseHealthPort {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async ping(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
