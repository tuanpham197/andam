import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from '../ports/out/refresh-token.repository.js';
import { SECURE_TOKENS, type SecureTokens } from '../ports/out/secure-tokens.port.js';

@Injectable()
export class LogoutService {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(SECURE_TOKENS) private readonly secureTokens: SecureTokens,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Idempotent: an unknown, missing or already revoked token is not an error (TC-AUTH-017). */
  async execute(input: { refreshToken: string | undefined }): Promise<void> {
    if (!input.refreshToken) return;
    const token = await this.refreshTokens.findByHash(this.secureTokens.hash(input.refreshToken));
    if (!token || token.isRevoked) return;
    token.revoke(this.clock.now());
    await this.refreshTokens.save(token);
  }
}
