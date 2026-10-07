import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import { ID_GENERATOR, type IdGenerator } from '../../../../shared/kernel/id-generator.port.js';
import { RefreshToken } from '../../domain/refresh-token.js';
import { ACCESS_TOKENS, type AccessTokens } from '../ports/out/access-tokens.port.js';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from '../ports/out/refresh-token.repository.js';
import { SECURE_TOKENS, type SecureTokens } from '../ports/out/secure-tokens.port.js';
import type { Session } from './session.js';

/** Issues an access token + a refresh token (new family unless one is given). */
@Injectable()
export class SessionStarter {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(ACCESS_TOKENS) private readonly accessTokens: AccessTokens,
    @Inject(SECURE_TOKENS) private readonly secureTokens: SecureTokens,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async start(input: {
    userId: string;
    userAgent: string | null;
    familyId?: string;
  }): Promise<Session> {
    const now = this.clock.now();
    const rawRefresh = this.secureTokens.generate();
    const refresh = RefreshToken.issue({
      id: this.ids.next(),
      userId: input.userId,
      familyId: input.familyId ?? this.ids.next(),
      tokenHash: this.secureTokens.hash(rawRefresh),
      userAgent: input.userAgent,
      now,
    });
    await this.refreshTokens.create(refresh);
    const access = await this.accessTokens.issue(input.userId, now);
    return {
      userId: input.userId,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: rawRefresh,
      refreshTokenExpiresAt: refresh.expiresAt,
    };
  }
}
