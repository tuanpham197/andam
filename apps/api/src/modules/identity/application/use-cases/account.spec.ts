import { PASSWORD, identityTestbed, registered } from '../../../../../test/fakes/identity.js';
import {
  InvalidAccessTokenError,
  InvalidCredentialsError,
  OwnershipTransferRequiredError,
} from '../../domain/errors.js';

describe('GetMeService', () => {
  it('returns the account profile', async () => {
    const t = identityTestbed();
    const { userId } = await registered(t);
    await expect(t.getMe.execute({ userId })).resolves.toEqual({
      id: userId,
      email: 'na@example.vn',
      timezone: 'Asia/Ho_Chi_Minh',
      displayName: null,
      createdAt: t.clock.now(),
    });
  });

  it('FR-119 sets and clears the display name', async () => {
    const t = identityTestbed();
    const { userId } = await registered(t);
    expect((await t.getMe.rename({ userId, displayName: ' Mẹ Na ' })).displayName).toBe('Mẹ Na');
    expect((await t.getMe.execute({ userId })).displayName).toBe('Mẹ Na');
    expect((await t.getMe.rename({ userId, displayName: null })).displayName).toBeNull();
    await expect(t.getMe.rename({ userId: 'ghost', displayName: 'x' })).rejects.toThrow(
      InvalidAccessTokenError,
    );
  });

  it.each([
    ['unknown', async () => 'no-such-user'],
    [
      'deleted',
      async (t: ReturnType<typeof identityTestbed>) => {
        const { userId } = await registered(t);
        await t.deleteAccount.execute({ userId, password: PASSWORD });
        return userId;
      },
    ],
  ])('treats an %s account as signed out', async (_label, prepare) => {
    const t = identityTestbed();
    const userId = await prepare(t);
    await expect(t.getMe.execute({ userId })).rejects.toThrow(InvalidAccessTokenError);
  });
});

describe('DeleteAccountService (UC-19)', () => {
  it('TC-AUTH-021 refuses the wrong password and changes nothing', async () => {
    const t = identityTestbed();
    const { userId } = await registered(t);
    await expect(t.deleteAccount.execute({ userId, password: 'wrong password' })).rejects.toThrow(
      InvalidCredentialsError,
    );
    expect((await t.users.findById(userId))!.isActive).toBe(true);
    expect(t.refreshTokens.active()).toHaveLength(1);
  });

  it('TC-AUTH-022 deactivates the account and signs every device out', async () => {
    const t = identityTestbed();
    const session = await registered(t);
    await t.deleteAccount.execute({ userId: session.userId, password: PASSWORD });

    expect((await t.users.findById(session.userId))!.deletedAt).toEqual(t.clock.now());
    expect(t.refreshTokens.active()).toHaveLength(0);
    await expect(t.authenticate.execute({ accessToken: session.accessToken })).rejects.toThrow(
      InvalidAccessTokenError,
    );
  });

  it('TC-FAM-018 an owner whose child is still used by others must hand it over first', async () => {
    const t = identityTestbed();
    const { userId } = await registered(t);
    t.accountChildren.blocking = [{ id: 'c-1', name: 'Na' }];
    const error = await t.deleteAccount
      .execute({ userId, password: PASSWORD })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OwnershipTransferRequiredError);
    expect((error as OwnershipTransferRequiredError).details).toEqual({
      children: [{ id: 'c-1', name: 'Na' }],
    });
    expect((await t.users.findById(userId))!.isActive).toBe(true);
    expect(t.accountChildren.left).toEqual([]);
  });

  it('TC-FAM-019 a caregiver closing the account leaves every child', async () => {
    const t = identityTestbed();
    const { userId } = await registered(t);
    await t.deleteAccount.execute({ userId, password: PASSWORD });
    expect(t.accountChildren.left).toEqual([userId]);
  });

  it('refuses an account that no longer exists', async () => {
    const t = identityTestbed();
    await expect(t.deleteAccount.execute({ userId: 'ghost', password: PASSWORD })).rejects.toThrow(
      InvalidAccessTokenError,
    );
  });
});

describe('AuthenticateService', () => {
  it('resolves a valid access token to its user', async () => {
    const t = identityTestbed();
    const session = await registered(t);
    await expect(t.authenticate.execute({ accessToken: session.accessToken })).resolves.toEqual({
      userId: session.userId,
    });
  });

  it.each([undefined, '', 'garbage', 'access.no-such-user.1'])(
    'TC-AUTH-012 rejects %j',
    async (accessToken) => {
      const t = identityTestbed();
      await expect(t.authenticate.execute({ accessToken })).rejects.toThrow(
        InvalidAccessTokenError,
      );
    },
  );
});
