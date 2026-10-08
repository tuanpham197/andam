import { Logger } from '@nestjs/common';
import type { Env } from '../../../../../shared/infrastructure/config/env.js';
import type { PurgeDeletedAccountsService } from '../../../application/use-cases/purge-deleted-accounts.service.js';
import { AccountPurgeJob } from './account-purge.job.js';

function job(minutes: number, execute: () => Promise<number>) {
  const purge = { execute: vi.fn(execute) };
  const env = { ACCOUNT_PURGE_INTERVAL_MINUTES: minutes } as Env;
  return { purge, job: new AccountPurgeJob(purge as unknown as PurgeDeletedAccountsService, env) };
}

describe('AccountPurgeJob (UC-19)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs at start-up, then on every interval, until the app shuts down', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { purge, job: j } = job(60, async () => 2);
    j.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    expect(purge.execute).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('Erased 2 closed account(s) (UC-19)');

    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(purge.execute).toHaveBeenCalledTimes(2);

    j.onApplicationShutdown();
    j.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(3 * 60 * 60_000);
    expect(purge.execute).toHaveBeenCalledTimes(2);
  });

  it('stays quiet when nothing is due', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { job: j } = job(60, async () => 0);
    await j.run();
    expect(log).not.toHaveBeenCalled();
  });

  it('is off with an interval of 0', async () => {
    const { purge, job: j } = job(0, async () => 0);
    j.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
    expect(purge.execute).not.toHaveBeenCalled();
  });

  it('logs a failed run and keeps going', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const failure = new Error('database is down');
    const { job: j } = job(60, () => Promise.reject(failure));
    await expect(j.run()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith('Account purge failed', failure.stack);

    const odd = job(60, () => Promise.reject('timeout'));
    await odd.job.run();
    expect(error).toHaveBeenLastCalledWith('Account purge failed', 'timeout');
  });
});
