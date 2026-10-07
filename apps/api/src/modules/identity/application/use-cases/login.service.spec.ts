import { PASSWORD, identityTestbed, registered } from '../../../../../test/fakes/identity.js';
import { MINUTE } from '../../../../../test/fakes/kernel.js';
import { InvalidCredentialsError, TooManyAttemptsError } from '../../domain/errors.js';

const login = (
  t: ReturnType<typeof identityTestbed>,
  email = 'na@example.vn',
  password = PASSWORD,
) => t.login.execute({ email, password, userAgent: 'Chrome' });

describe('LoginService', () => {
  it('opens a session for the right credentials and records the success', async () => {
    const t = identityTestbed();
    const { userId } = await registered(t);

    const session = await login(t);

    expect(session.userId).toBe(userId);
    expect(session.accessToken).toMatch(/^access\./);
    expect(t.attempts.rows.at(-1)).toEqual({
      email: 'na@example.vn',
      attempt: { succeeded: true, attemptedAt: t.clock.now() },
    });
  });

  it('starts a new token family per login', async () => {
    const t = identityTestbed();
    await registered(t);
    await login(t);
    const families = new Set([...t.refreshTokens.rows.values()].map((r) => r.familyId));
    expect(families.size).toBe(2);
  });

  it('normalises the e-mail the same way as registration', async () => {
    const t = identityTestbed();
    await registered(t);
    await expect(login(t, '  NA@Example.vn ')).resolves.toBeDefined();
  });

  it('TC-AUTH-007 accepts the password typed in decomposed Unicode', async () => {
    const t = identityTestbed();
    await t.register.execute({
      email: 'na@example.vn',
      password: 'Mẹ ăn dặm 2026',
      consentVersion: '2026-09-28',
      userAgent: null,
      ip: null,
    });
    await expect(
      login(t, 'na@example.vn', 'Mẹ ăn dặm 2026'.normalize('NFD')),
    ).resolves.toBeDefined();
  });

  describe('TC-AUTH-009 never reveals whether an account exists', () => {
    it('fails a wrong password with INVALID_CREDENTIALS and records the failure', async () => {
      const t = identityTestbed();
      await registered(t);
      await expect(login(t, 'na@example.vn', 'wrong password')).rejects.toThrow(
        InvalidCredentialsError,
      );
      expect(t.attempts.rows.at(-1)!.attempt.succeeded).toBe(false);
    });

    it('fails an unknown e-mail with the same error and still spends hashing time', async () => {
      const t = identityTestbed();
      await expect(login(t, 'ghost@example.vn')).rejects.toThrow(InvalidCredentialsError);
      expect(t.hasher.hashCalls + t.hasher.verifyCalls).toBe(1);
      expect(t.attempts.rows).toHaveLength(1);
    });

    it('fails a deleted account with the same error', async () => {
      const t = identityTestbed();
      const { userId } = await registered(t);
      await t.deleteAccount.execute({ userId, password: PASSWORD });
      await expect(login(t)).rejects.toThrow(InvalidCredentialsError);
    });
  });

  describe('TC-AUTH-010 lockout after 5 failures in 15 minutes', () => {
    async function failFiveTimes(t: ReturnType<typeof identityTestbed>) {
      for (let i = 0; i < 5; i += 1) {
        await expect(login(t, 'na@example.vn', 'wrong password')).rejects.toThrow(
          InvalidCredentialsError,
        );
        t.clock.advance(MINUTE);
      }
    }

    it('blocks the 6th attempt even with the right password', async () => {
      const t = identityTestbed();
      await registered(t);
      await failFiveTimes(t);
      await expect(login(t)).rejects.toThrow(TooManyAttemptsError);
    });

    it('does not verify the password nor extend the lock while locked', async () => {
      const t = identityTestbed();
      await registered(t);
      await failFiveTimes(t);
      const verifyCalls = t.hasher.verifyCalls;
      const recorded = t.attempts.rows.length;
      await expect(login(t)).rejects.toThrow(TooManyAttemptsError);
      expect(t.hasher.verifyCalls).toBe(verifyCalls);
      expect(t.attempts.rows).toHaveLength(recorded);
    });

    it('lets the user in again once the window has passed', async () => {
      const t = identityTestbed();
      await registered(t);
      await failFiveTimes(t);
      t.clock.advance(15 * MINUTE);
      await expect(login(t)).resolves.toBeDefined();
    });

    it('locks per e-mail, not globally', async () => {
      const t = identityTestbed();
      await registered(t);
      await registered(t, 'bin@example.vn');
      await failFiveTimes(t);
      await expect(login(t, 'bin@example.vn')).resolves.toBeDefined();
    });
  });
});
