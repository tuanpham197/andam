import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/kernel/unit-of-work.port.js';
import { ResetTokenInvalidError } from '../../domain/errors.js';
import { acceptablePassword } from '../../domain/password.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../ports/out/password-hasher.port.js';
import {
  PASSWORD_RESET_TOKEN_REPOSITORY,
  type PasswordResetTokenRepository,
} from '../ports/out/password-reset-token.repository.js';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from '../ports/out/refresh-token.repository.js';
import { SECURE_TOKENS, type SecureTokens } from '../ports/out/secure-tokens.port.js';
import { USER_REPOSITORY, type UserRepository } from '../ports/out/user.repository.js';

@Injectable()
export class ResetPasswordService {
  constructor(
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY)
    private readonly resetTokens: PasswordResetTokenRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(SECURE_TOKENS) private readonly secureTokens: SecureTokens,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  async execute(input: { token: string | undefined; newPassword: string }): Promise<void> {
    if (!input.token) throw new ResetTokenInvalidError();
    const now = this.clock.now();
    const resetToken = await this.resetTokens.findByHash(this.secureTokens.hash(input.token));
    if (!resetToken?.isUsable(now)) throw new ResetTokenInvalidError();

    const user = await this.users.findById(resetToken.userId);
    if (!user?.isActive) throw new ResetTokenInvalidError();

    const password = acceptablePassword(input.newPassword);
    const passwordHash = await this.hasher.hash(password);

    await this.uow.run(async () => {
      user.changePassword(passwordHash);
      await this.users.save(user);
      resetToken.markUsed(now);
      await this.resetTokens.save(resetToken);
      await this.refreshTokens.revokeAllForUser(user.id, now);
    });
  }
}
