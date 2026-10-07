import { Inject, Injectable } from '@nestjs/common';
import { InvalidAccessTokenError } from '../../domain/errors.js';
import { USER_REPOSITORY, type UserRepository } from '../ports/out/user.repository.js';

export interface AccountProfile {
  id: string;
  email: string;
  timezone: string;
  createdAt: Date;
}

@Injectable()
export class GetMeService {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async execute(input: { userId: string }): Promise<AccountProfile> {
    const user = await this.users.findById(input.userId);
    if (!user?.isActive) throw new InvalidAccessTokenError();
    return { id: user.id, email: user.email, timezone: user.timezone, createdAt: user.createdAt };
  }
}
