import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import { ID_GENERATOR, type IdGenerator } from '../../../../shared/kernel/id-generator.port.js';
import { normalizeEmail } from '../../domain/email.js';
import { PasswordResetToken } from '../../domain/password-reset-token.js';
import { IDENTITY_SETTINGS, type IdentitySettings } from '../ports/out/identity-settings.port.js';
import { MAILER, type Mailer } from '../ports/out/mailer.port.js';
import {
  PASSWORD_RESET_TOKEN_REPOSITORY,
  type PasswordResetTokenRepository,
} from '../ports/out/password-reset-token.repository.js';
import { SECURE_TOKENS, type SecureTokens } from '../ports/out/secure-tokens.port.js';
import { USER_REPOSITORY, type UserRepository } from '../ports/out/user.repository.js';

@Injectable()
export class RequestPasswordResetService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY)
    private readonly resetTokens: PasswordResetTokenRepository,
    @Inject(SECURE_TOKENS) private readonly secureTokens: SecureTokens,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(IDENTITY_SETTINGS) private readonly settings: IdentitySettings,
  ) {}

  /** Always resolves the same way so callers cannot probe which e-mails exist (TC-AUTH-018). */
  async execute(input: { email: string }): Promise<void> {
    const user = await this.users.findByEmail(normalizeEmail(input.email));
    if (!user?.isActive) return;

    const raw = this.secureTokens.generate();
    await this.resetTokens.create(
      PasswordResetToken.issue({
        id: this.ids.next(),
        userId: user.id,
        tokenHash: this.secureTokens.hash(raw),
        now: this.clock.now(),
      }),
    );
    const resetUrl = new URL('/reset-password', this.settings.webBaseUrl);
    resetUrl.searchParams.set('token', raw);
    await this.mailer.sendPasswordReset({ to: user.email, resetUrl: resetUrl.toString() });
  }
}
