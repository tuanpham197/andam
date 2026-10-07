import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/kernel/unit-of-work.port.js';
import { InvalidRefreshTokenError } from '../../domain/errors.js';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from '../ports/out/refresh-token.repository.js';
import { SECURE_TOKENS, type SecureTokens } from '../ports/out/secure-tokens.port.js';
import { USER_REPOSITORY, type UserRepository } from '../ports/out/user.repository.js';
import type { Session } from './session.js';
import { SessionStarter } from './session-starter.service.js';

@Injectable()
export class RefreshSessionService {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SessionStarter) private readonly sessions: SessionStarter,
    @Inject(SECURE_TOKENS) private readonly secureTokens: SecureTokens,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  async execute(input: {
    refreshToken: string | undefined;
    userAgent: string | null;
  }): Promise<Session> {
    if (!input.refreshToken) throw new InvalidRefreshTokenError();
    const now = this.clock.now();
    const token = await this.refreshTokens.findByHash(this.secureTokens.hash(input.refreshToken));
    if (!token) throw new InvalidRefreshTokenError();

    const user = await this.users.findById(token.userId);
    // Revocations below happen outside any transaction: they must survive the error we throw.
    if (!user?.isActive) {
      await this.refreshTokens.revokeFamily(token.familyId, now);
      throw new InvalidRefreshTokenError();
    }

    const startInFamily = () =>
      this.sessions.start({
        userId: user.id,
        userAgent: input.userAgent,
        familyId: token.familyId,
      });

    if (token.isRevoked) {
      // Another tab rotated this token a moment ago and the login is still alive (TC-AUTH-029).
      if (
        token.isWithinReuseGrace(now) &&
        (await this.refreshTokens.familyHasActiveToken(token.familyId, now))
      ) {
        return startInFamily();
      }
      // A rotated token came back later: someone else holds the chain (TC-AUTH-014).
      await this.refreshTokens.revokeFamily(token.familyId, now);
      throw new InvalidRefreshTokenError();
    }
    if (!token.isUsable(now)) throw new InvalidRefreshTokenError();

    const rotated = await this.uow.run(async () =>
      (await this.refreshTokens.rotateIfActive(token.id, now)) ? startInFamily() : null,
    );
    // Re-evaluate from the stored state: a concurrent rotation gets the grace, a logout does not.
    return rotated ?? this.execute(input);
  }
}
