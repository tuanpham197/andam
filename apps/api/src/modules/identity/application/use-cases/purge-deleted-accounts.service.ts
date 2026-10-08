import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import { HARD_DELETE_AFTER_DAYS } from '../../domain/user.js';
import { USER_REPOSITORY, type UserRepository } from '../ports/out/user.repository.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** UC-19: erases accounts closed more than 30 days ago. Safe to run often and on many instances. */
@Injectable()
export class PurgeDeletedAccountsService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute(): Promise<number> {
    const cutoff = new Date(this.clock.now().getTime() - HARD_DELETE_AFTER_DAYS * DAY_MS);
    return this.users.purgeDeletedBefore(cutoff);
  }
}
