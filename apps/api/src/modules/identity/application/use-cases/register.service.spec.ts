import { PASSWORD, identityTestbed, registered } from '../../../../../test/fakes/identity.js';
import { MINUTE } from '../../../../../test/fakes/kernel.js';
import {
  ConsentRequiredError,
  EmailTakenError,
  InvalidEmailError,
  PasswordTooShortError,
  WeakPasswordError,
} from '../../domain/errors.js';

describe('RegisterService', () => {
  it('TC-AUTH-001 creates the account, records consent and opens a session', async () => {
    const t = identityTestbed();
    const session = await registered(t, '  Na@Example.VN ');

    const user = await t.users.findByEmail('na@example.vn');
    expect(user).not.toBeNull();
    expect(user!.passwordHash).toBe(`hashed:${PASSWORD}`);
    expect(t.users.consents.get(user!.id)).toEqual({
      id: expect.any(String),
      version: '2026-09-28',
      acceptedAt: t.clock.now(),
      ip: '203.0.113.9',
    });

    expect(session).toEqual({
      userId: user!.id,
      accessToken: expect.stringMatching(/^access\./),
      accessTokenExpiresAt: new Date(t.clock.now().getTime() + 15 * MINUTE),
      refreshToken: expect.stringMatching(/^secret-/),
      refreshTokenExpiresAt: expect.any(Date),
    });
    expect(t.uow.runs).toBe(1);
  });

  it('stores only the hash of the refresh token', async () => {
    const t = identityTestbed();
    const session = await registered(t);
    const [stored] = t.refreshTokens.active();
    expect(stored!.tokenHash).toBe(`sha256(${session.refreshToken})`);
    expect(stored!.userAgent).toBe('Safari');
  });

  it('hashes the NFC form of the password', async () => {
    const t = identityTestbed();
    await t.register.execute({
      email: 'na@example.vn',
      password: 'Mé an dăm 2026',
      consentVersion: '2026-09-28',
      userAgent: null,
      ip: null,
    });
    const user = await t.users.findByEmail('na@example.vn');
    expect(user!.passwordHash).toBe(`hashed:${'Mé an dăm 2026'.normalize('NFC')}`);
  });

  it('TC-AUTH-002 refuses an e-mail that differs only by case', async () => {
    const t = identityTestbed();
    await registered(t, 'na@example.vn');
    await expect(registered(t, 'NA@EXAMPLE.VN')).rejects.toThrow(EmailTakenError);
  });

  it('keeps the e-mail of a soft-deleted account reserved', async () => {
    const t = identityTestbed();
    const { userId } = await registered(t);
    await t.deleteAccount.execute({ userId, password: PASSWORD });
    await expect(registered(t)).rejects.toThrow(EmailTakenError);
  });

  describe('validates everything before writing anything', () => {
    it.each([
      ['invalid e-mail', { email: 'not-an-email' }, InvalidEmailError],
      ['missing consent', { consentVersion: undefined }, ConsentRequiredError],
      ['outdated consent', { consentVersion: '2025-01-01' }, ConsentRequiredError],
      ['short password', { password: 'short' }, PasswordTooShortError],
      ['common password', { password: 'password123' }, WeakPasswordError],
    ])('%s', async (_label, override, error) => {
      const t = identityTestbed();
      await expect(
        t.register.execute({
          email: 'na@example.vn',
          password: PASSWORD,
          consentVersion: '2026-09-28',
          userAgent: null,
          ip: null,
          ...override,
        }),
      ).rejects.toThrow(error);
      expect(t.users.rows.size).toBe(0);
      expect(t.refreshTokens.rows.size).toBe(0);
      expect(t.hasher.hashCalls).toBe(0);
    });
  });
});
