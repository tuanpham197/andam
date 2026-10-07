import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { CLOCK, type Clock } from '../../../../../shared/kernel/clock.port.js';
import {
  ACCESS_TOKEN_TTL_MS,
  type AccessTokens,
} from '../../../application/ports/out/access-tokens.port.js';

@Injectable()
export class JwtAccessTokens implements AccessTokens {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async issue(userId: string, now: Date): Promise<{ token: string; expiresAt: Date }> {
    const iat = Math.floor(now.getTime() / 1000);
    const exp = iat + ACCESS_TOKEN_TTL_MS / 1000;
    const token = await this.jwt.signAsync(
      { sub: userId, iat, exp, jti: randomUUID() },
      { algorithm: 'HS256' },
    );
    return { token, expiresAt: new Date(exp * 1000) };
  }

  async verify(token: string): Promise<string | null> {
    try {
      // Pinning the algorithm rejects `alg: none` and key-confusion tricks (TC-AUTH-012);
      // expiry is judged by the same clock that issued the token.
      const payload = await this.jwt.verifyAsync<{ sub?: string }>(token, {
        algorithms: ['HS256'],
        clockTimestamp: Math.floor(this.clock.now().getTime() / 1000),
      });
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }
}
