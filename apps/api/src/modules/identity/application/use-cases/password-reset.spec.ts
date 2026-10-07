import { PASSWORD, identityTestbed, registered } from '../../../../../test/fakes/identity.js';
import { MINUTE } from '../../../../../test/fakes/kernel.js';
import {
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  ResetTokenInvalidError,
  WeakPasswordError,
} from '../../domain/errors.js';

const NEW_PASSWORD = 'Bột yến mạch chuối!';

async function requestLink(t: ReturnType<typeof identityTestbed>, email = 'na@example.vn') {
  await t.requestReset.execute({ email });
  const url = t.mailer.sent.at(-1)?.resetUrl;
  return url ? new URL(url).searchParams.get('token')! : undefined;
}

describe('RequestPasswordResetService', () => {
  it('mails a single-use link to the web app', async () => {
    const t = identityTestbed();
    await registered(t);
    const token = await requestLink(t, ' NA@example.vn');

    expect(t.mailer.sent).toEqual([
      { to: 'na@example.vn', resetUrl: `https://thucdon.test/reset-password?token=${token}` },
    ]);
    const [stored] = t.resetTokens.rows.values();
    expect(stored!.tokenHash).toBe(`sha256(${token})`);
    expect(stored!.expiresAt).toEqual(new Date(t.clock.now().getTime() + 30 * MINUTE));
  });

  it('TC-AUTH-018 answers the same for an unknown e-mail and sends nothing', async () => {
    const t = identityTestbed();
    await expect(t.requestReset.execute({ email: 'ghost@example.vn' })).resolves.toBeUndefined();
    expect(t.mailer.sent).toHaveLength(0);
    expect(t.resetTokens.rows.size).toBe(0);
  });

  it('sends nothing for a deleted account', async () => {
    const t = identityTestbed();
    const { userId } = await registered(t);
    await t.deleteAccount.execute({ userId, password: PASSWORD });
    await t.requestReset.execute({ email: 'na@example.vn' });
    expect(t.mailer.sent).toHaveLength(0);
  });
});

describe('ResetPasswordService', () => {
  it('changes the password so only the new one works', async () => {
    const t = identityTestbed();
    await registered(t);
    const token = await requestLink(t);

    await t.resetPassword.execute({ token, newPassword: NEW_PASSWORD });

    await expect(
      t.login.execute({ email: 'na@example.vn', password: PASSWORD, userAgent: null }),
    ).rejects.toThrow(InvalidCredentialsError);
    await expect(
      t.login.execute({ email: 'na@example.vn', password: NEW_PASSWORD, userAgent: null }),
    ).resolves.toBeDefined();
    expect(t.uow.runs).toBe(2);
  });

  it('TC-AUTH-020 signs every device out', async () => {
    const t = identityTestbed();
    const session = await registered(t);
    const token = await requestLink(t);
    await t.resetPassword.execute({ token, newPassword: NEW_PASSWORD });
    await expect(
      t.refresh.execute({ refreshToken: session.refreshToken, userAgent: null }),
    ).rejects.toThrow(InvalidRefreshTokenError);
  });

  describe('TC-AUTH-019 invalid links', () => {
    it('cannot be used twice', async () => {
      const t = identityTestbed();
      await registered(t);
      const token = await requestLink(t);
      await t.resetPassword.execute({ token, newPassword: NEW_PASSWORD });
      await expect(
        t.resetPassword.execute({ token, newPassword: 'Another password 42' }),
      ).rejects.toThrow(ResetTokenInvalidError);
    });

    it('expires after 30 minutes', async () => {
      const t = identityTestbed();
      await registered(t);
      const token = await requestLink(t);
      t.clock.advance(30 * MINUTE + 1);
      await expect(t.resetPassword.execute({ token, newPassword: NEW_PASSWORD })).rejects.toThrow(
        ResetTokenInvalidError,
      );
    });

    it.each([undefined, '', 'forged'])('rejects the token %j', async (token) => {
      const t = identityTestbed();
      await expect(t.resetPassword.execute({ token, newPassword: NEW_PASSWORD })).rejects.toThrow(
        ResetTokenInvalidError,
      );
    });

    it('rejects when the account was deleted after the link was sent', async () => {
      const t = identityTestbed();
      const { userId } = await registered(t);
      const token = await requestLink(t);
      await t.deleteAccount.execute({ userId, password: PASSWORD });
      await expect(t.resetPassword.execute({ token, newPassword: NEW_PASSWORD })).rejects.toThrow(
        ResetTokenInvalidError,
      );
    });
  });

  it('keeps the link usable when the new password is rejected', async () => {
    const t = identityTestbed();
    await registered(t);
    const token = await requestLink(t);
    await expect(t.resetPassword.execute({ token, newPassword: '12345678' })).rejects.toThrow(
      WeakPasswordError,
    );
    await expect(
      t.resetPassword.execute({ token, newPassword: NEW_PASSWORD }),
    ).resolves.toBeUndefined();
  });
});
