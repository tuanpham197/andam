import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_HEALTH, type DatabaseHealthPort } from '../ports/out/database-health.port.js';

export interface HealthReport {
  status: 'ok' | 'error';
  checks: { database: 'up' | 'down' };
}

@Injectable()
export class CheckHealthService {
  constructor(@Inject(DATABASE_HEALTH) private readonly database: DatabaseHealthPort) {}

  async execute(): Promise<HealthReport> {
    const up = await this.database.ping().catch(() => false);
    return up
      ? { status: 'ok', checks: { database: 'up' } }
      : { status: 'error', checks: { database: 'down' } };
  }
}
