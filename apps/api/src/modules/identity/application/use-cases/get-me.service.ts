import { Inject, Injectable } from '@nestjs/common';
import { InvalidAccessTokenError } from '../../domain/errors.js';
import type { User } from '../../domain/user.js';
import { USER_REPOSITORY, type UserRepository } from '../ports/out/user.repository.js';

export interface AccountProfile {
  id: string;
  email: string;
  timezone: string;
  /** As set by the user; null when not set (FR-119). */
  displayName: string | null;
  createdAt: Date;
}

const profileOf = (user: User): AccountProfile => ({
  id: user.id,
  email: user.email,
  timezone: user.timezone,
  displayName: user.displayName,
  createdAt: user.createdAt,
});

@Injectable()
export class GetMeService {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async execute(input: { userId: string }): Promise<AccountProfile> {
    const user = await this.users.findById(input.userId);
    if (!user?.isActive) throw new InvalidAccessTokenError();
    return profileOf(user);
  }

  /** FR-119: the name other members of a child see. */
  async rename(input: { userId: string; displayName: string | null }): Promise<AccountProfile> {
    const user = await this.users.findById(input.userId);
    if (!user?.isActive) throw new InvalidAccessTokenError();
    user.rename(input.displayName);
    await this.users.save(user);
    return profileOf(user);
  }
}
