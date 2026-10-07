import { PASSWORD, identityTestbed, registered } from '../../../../../test/fakes/identity.js';
import { DAY } from '../../../../../test/fakes/kernel.js';
import { REUSE_GRACE_MS } from '../../domain/refresh-token.js';
import { InvalidRefreshTokenError } from '../../domain/errors.js';

describe('RefreshSessionService', () => {
  it('TC-AUTH-013 rotates: a new pair is issued in the same family and the old token dies', async () => {
    const t = identityTestbed();
    const first = await registered(t);

    const second = await t.refresh.execute({
      refreshToken: first.refreshToken,
      userAgent: 'Safari',
    });

    expect(second.userId).toBe(first.userId);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.accessToken).not.toBe(first.accessToken);
    const rows = [...t.refreshTokens.rows.values()];
    expect(new Set(rows.map((r) => r.familyId)).size).toBe(1);
    expect(rows.find((r) => r.tokenHash === `sha256(${first.refreshToken})`)!.isRevoked).toBe(true);
    expect(t.uow.runs).toBe(2);
  });

  it('TC-AUTH-014 treats reuse of a rotated token after the grace period as theft', async () => {
    const t = identityTestbed();
    const first = await registered(t);
    const second = await t.refresh.execute({ refreshToken: first.refreshToken, userAgent: null });

    t.clock.advance(REUSE_GRACE_MS + 1);
    await expect(
      t.refresh.execute({ refreshToken: first.refreshToken, userAgent: null }),
    ).rejects.toThrow(InvalidRefreshTokenError);
    await expect(
      t.refresh.execute({ refreshToken: second.refreshToken, userAgent: null }),
    ).rejects.toThrow(InvalidRefreshTokenError);
    expect(t.refreshTokens.active()).toHaveLength(0);
  });

  it('TC-AUTH-029 lets a second tab reuse the just-rotated token within 10 seconds', async () => {
    const t = identityTestbed();
    const first = await registered(t);
    const tab1 = await t.refresh.execute({ refreshToken: first.refreshToken, userAgent: 'tab 1' });
    t.clock.advance(REUSE_GRACE_MS);

    const tab2 = await t.refresh.execute({ refreshToken: first.refreshToken, userAgent: 'tab 2' });

    expect(tab2.refreshToken).not.toBe(tab1.refreshToken);
    await expect(
      t.refresh.execute({ refreshToken: tab1.refreshToken, userAgent: null }),
    ).resolves.toBeDefined();
    await expect(
      t.refresh.execute({ refreshToken: tab2.refreshToken, userAgent: null }),
    ).resolves.toBeDefined();
  });

  it('gives no grace once the rest of the family is signed out', async () => {
    const t = identityTestbed();
    const first = await registered(t);
    const second = await t.refresh.execute({ refreshToken: first.refreshToken, userAgent: null });
    await t.logout.execute({ refreshToken: second.refreshToken });

    await expect(
      t.refresh.execute({ refreshToken: first.refreshToken, userAgent: null }),
    ).rejects.toThrow(InvalidRefreshTokenError);
  });

  it('gives no grace to a token that was revoked by logout', async () => {
    const t = identityTestbed();
    const first = await registered(t);
    await t.logout.execute({ refreshToken: first.refreshToken });
    await expect(
      t.refresh.execute({ refreshToken: first.refreshToken, userAgent: null }),
    ).rejects.toThrow(InvalidRefreshTokenError);
  });

  it('does not touch other logins of the same user when one family is revoked', async () => {
    const t = identityTestbed();
    const first = await registered(t);
    const otherDevice = await t.login.execute({
      email: 'na@example.vn',
      password: PASSWORD,
      userAgent: 'Tablet',
    });
    await t.refresh.execute({ refreshToken: first.refreshToken, userAgent: null });
    t.clock.advance(REUSE_GRACE_MS + 1);
    await expect(
      t.refresh.execute({ refreshToken: first.refreshToken, userAgent: null }),
    ).rejects.toThrow();

    await expect(
      t.refresh.execute({ refreshToken: otherDevice.refreshToken, userAgent: null }),
    ).resolves.toBeDefined();
  });

  it('TC-AUTH-025 serves two simultaneous refreshes with the same token (two tabs opening)', async () => {
    const t = identityTestbed();
    const first = await registered(t);
    const results = await Promise.all([
      t.refresh.execute({ refreshToken: first.refreshToken, userAgent: 'tab 1' }),
      t.refresh.execute({ refreshToken: first.refreshToken, userAgent: 'tab 2' }),
    ]);
    expect(new Set(results.map((r) => r.refreshToken)).size).toBe(2);
    expect(t.refreshTokens.active()).toHaveLength(2);
  });

  it('does not resurrect a session logged out while its refresh was in flight', async () => {
    const t = identityTestbed();
    const first = await registered(t);
    const rotateIfActive = t.refreshTokens.rotateIfActive.bind(t.refreshTokens);
    // Logout lands between reading the token and rotating it.
    t.refreshTokens.rotateIfActive = async (id, now) => {
      await t.logout.execute({ refreshToken: first.refreshToken });
      return rotateIfActive(id, now);
    };
    await expect(
      t.refresh.execute({ refreshToken: first.refreshToken, userAgent: null }),
    ).rejects.toThrow(InvalidRefreshTokenError);
    expect(t.refreshTokens.active()).toHaveLength(0);
  });

  it('TC-AUTH-015 rejects an expired token', async () => {
    const t = identityTestbed();
    const first = await registered(t);
    t.clock.advance(30 * DAY + 1);
    await expect(
      t.refresh.execute({ refreshToken: first.refreshToken, userAgent: null }),
    ).rejects.toThrow(InvalidRefreshTokenError);
  });

  it.each([undefined, '', 'never-issued'])('rejects the token %j', async (refreshToken) => {
    const t = identityTestbed();
    await expect(t.refresh.execute({ refreshToken, userAgent: null })).rejects.toThrow(
      InvalidRefreshTokenError,
    );
  });

  it('rejects and revokes when the account has been deleted', async () => {
    const t = identityTestbed();
    const first = await registered(t);
    const user = await t.users.findById(first.userId);
    user!.delete(t.clock.now());
    await t.users.save(user!);

    await expect(
      t.refresh.execute({ refreshToken: first.refreshToken, userAgent: null }),
    ).rejects.toThrow(InvalidRefreshTokenError);
    expect(t.refreshTokens.active()).toHaveLength(0);
  });
});
