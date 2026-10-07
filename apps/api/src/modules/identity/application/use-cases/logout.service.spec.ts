import { identityTestbed, registered } from '../../../../../test/fakes/identity.js';
import { InvalidRefreshTokenError } from '../../domain/errors.js';

describe('LogoutService', () => {
  it('revokes the current refresh token', async () => {
    const t = identityTestbed();
    const session = await registered(t);
    await t.logout.execute({ refreshToken: session.refreshToken });
    expect(t.refreshTokens.active()).toHaveLength(0);
    await expect(
      t.refresh.execute({ refreshToken: session.refreshToken, userAgent: null }),
    ).rejects.toThrow(InvalidRefreshTokenError);
  });

  it('TC-AUTH-017 is idempotent and never fails', async () => {
    const t = identityTestbed();
    const session = await registered(t);
    await t.logout.execute({ refreshToken: session.refreshToken });
    await expect(t.logout.execute({ refreshToken: session.refreshToken })).resolves.toBeUndefined();
    await expect(t.logout.execute({ refreshToken: 'unknown' })).resolves.toBeUndefined();
    await expect(t.logout.execute({ refreshToken: undefined })).resolves.toBeUndefined();
  });
});
