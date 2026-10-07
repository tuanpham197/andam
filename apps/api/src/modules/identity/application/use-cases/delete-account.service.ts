import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/kernel/unit-of-work.port.js';
import { InvalidAccessTokenError, InvalidCredentialsError } from '../../domain/errors.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../ports/out/password-hasher.port.js';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from '../ports/out/refresh-token.repository.js';
import { USER_REPOSITORY, type UserRepository } from '../ports/out/user.repository.js';

@Injectable()
export class DeleteAccountService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  async execute(input: { userId: string; password: string }): Promise<void> {
    const user = await this.users.findById(input.userId);
    if (!user?.isActive) throw new InvalidAccessTokenError();
    const valid = await this.hasher.verify(user.passwordHash, input.password.normalize('NFC'));
    if (!valid) throw new InvalidCredentialsError();

    const now = this.clock.now();
    await this.uow.run(async () => {
      user.delete(now);
      await this.users.save(user);
      await this.refreshTokens.revokeAllForUser(user.id, now);
    });
  }
}
