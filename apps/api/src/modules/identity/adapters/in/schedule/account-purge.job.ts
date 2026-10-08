import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ENV } from '../../../../../shared/infrastructure/config/config.module.js';
import type { Env } from '../../../../../shared/infrastructure/config/env.js';
import { PurgeDeletedAccountsService } from '../../../application/use-cases/purge-deleted-accounts.service.js';

/**
 * Runs the UC-19 hard deletion at start-up and then every ACCOUNT_PURGE_INTERVAL_MINUTES
 * (0 turns it off, as in tests). Every instance may run it: deleting is idempotent.
 */
@Injectable()
export class AccountPurgeJob implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AccountPurgeJob.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(PurgeDeletedAccountsService) private readonly purge: PurgeDeletedAccountsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap(): void {
    const minutes = this.env.ACCOUNT_PURGE_INTERVAL_MINUTES;
    if (minutes === 0) return;
    void this.run();
    this.timer = setInterval(() => void this.run(), minutes * 60_000);
    // Never keeps the process alive on its own.
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Never throws: a failed run is logged and the next one tries again. */
  async run(): Promise<void> {
    try {
      const erased = await this.purge.execute();
      if (erased > 0) this.logger.log(`Erased ${erased} closed account(s) (UC-19)`);
    } catch (error) {
      this.logger.error('Account purge failed', error instanceof Error ? error.stack : error);
    }
  }
}
