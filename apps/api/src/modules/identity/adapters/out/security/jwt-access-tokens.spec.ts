import { JwtService } from '@nestjs/jwt';
import { FixedClock } from '../../../../../../test/fakes/kernel.js';
import { JwtAccessTokens } from './jwt-access-tokens.js';

const SECRET = 'unit-secret-unit-secret-unit-secret!';

describe('JwtAccessTokens', () => {
  const clock = new FixedClock(new Date('2026-09-24T02:00:00Z'));
  const tokens = new JwtAccessTokens(new JwtService({ secret: SECRET }), clock);
  beforeEach(() => clock.set('2026-09-24T02:00:00Z'));

  it('issues a 15-minute HS256 token carrying the user id', async () => {
    const now = clock.now();
    const { token, expiresAt } = await tokens.issue('user-1', now);
    // JWT `exp` has second precision, so expiry lands within the last second of 15 minutes.
    const lifetime = expiresAt.getTime() - now.getTime();
    expect(lifetime).toBeGreaterThan(15 * 60_000 - 1000);
    expect(lifetime).toBeLessThanOrEqual(15 * 60_000);
    const [header] = token.split('.');
    expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toMatchObject({
      alg: 'HS256',
    });
    await expect(tokens.verify(token)).resolves.toBe('user-1');
  });

  it('gives two tokens issued in the same second a distinct id (jti)', async () => {
    const now = clock.now();
    const a = await tokens.issue('user-1', now);
    const b = await tokens.issue('user-1', now);
    expect(a.token).not.toBe(b.token);
  });

  it('TC-AUTH-011 accepts a token until 15 minutes, rejects it one second later', async () => {
    const { token } = await tokens.issue('user-1', clock.now());
    clock.advance(15 * 60_000 - 1000);
    await expect(tokens.verify(token)).resolves.toBe('user-1');
    clock.advance(2000);
    await expect(tokens.verify(token)).resolves.toBeNull();
  });

  it('checks expiry against the application clock, not the host clock', async () => {
    // The app clock is days behind the host clock here, as in tests or after a drifted NTP sync.
    const { token } = await tokens.issue('user-1', clock.now());
    await expect(tokens.verify(token)).resolves.toBe('user-1');
  });

  describe('TC-AUTH-012 rejects forged tokens', () => {
    it('with a different secret', async () => {
      const other = new JwtAccessTokens(
        new JwtService({ secret: 'another-secret-another-secret-!!' }),
        clock,
      );
      const { token } = await other.issue('user-1', clock.now());
      await expect(tokens.verify(token)).resolves.toBeNull();
    });

    it('with a tampered payload', async () => {
      const { token } = await tokens.issue('user-1', clock.now());
      const [header, , signature] = token.split('.');
      const forged = Buffer.from(JSON.stringify({ sub: 'admin', exp: 9999999999 })).toString(
        'base64url',
      );
      await expect(tokens.verify(`${header}.${forged}.${signature}`)).resolves.toBeNull();
    });

    it('with alg "none"', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ sub: 'user-1', exp: 9999999999 })).toString(
        'base64url',
      );
      await expect(tokens.verify(`${header}.${payload}.`)).resolves.toBeNull();
    });

    it('that is not a JWT at all', async () => {
      await expect(tokens.verify('garbage')).resolves.toBeNull();
    });

    it('without a subject', async () => {
      const jwt = new JwtService({ secret: SECRET });
      const iat = Math.floor(clock.now().getTime() / 1000);
      const token = await jwt.signAsync({ role: 'x', iat, exp: iat + 60 }, { algorithm: 'HS256' });
      await expect(tokens.verify(token)).resolves.toBeNull();
    });
  });
});
