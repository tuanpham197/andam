import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaIdentityModule } from '../../src/modules/identity/adapters/out/persistence/prisma-identity.module.js';
import {
  LOGIN_ATTEMPT_REPOSITORY,
  type LoginAttemptRepository,
} from '../../src/modules/identity/application/ports/out/login-attempt.repository.js';
import {
  PASSWORD_RESET_TOKEN_REPOSITORY,
  type PasswordResetTokenRepository,
} from '../../src/modules/identity/application/ports/out/password-reset-token.repository.js';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from '../../src/modules/identity/application/ports/out/refresh-token.repository.js';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../src/modules/identity/application/ports/out/user.repository.js';
import type { Email } from '../../src/modules/identity/domain/email.js';
import { EmailTakenError } from '../../src/modules/identity/domain/errors.js';
import { PasswordResetToken } from '../../src/modules/identity/domain/password-reset-token.js';
import { RefreshToken } from '../../src/modules/identity/domain/refresh-token.js';
import { User } from '../../src/modules/identity/domain/user.js';
import { ConfigModule } from '../../src/shared/infrastructure/config/config.module.js';
import { KernelModule } from '../../src/shared/infrastructure/kernel/kernel.module.js';
import { PersistenceModule } from '../../src/shared/infrastructure/persistence/persistence.module.js';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service.js';
import { UNIT_OF_WORK, type UnitOfWork } from '../../src/shared/kernel/unit-of-work.port.js';
import { resetDatabase } from '../support/database.js';

let moduleRef: TestingModule;
let prisma: PrismaService;
let users: UserRepository;
let refreshTokens: RefreshTokenRepository;
let resetTokens: PasswordResetTokenRepository;
let attempts: LoginAttemptRepository;
let uow: UnitOfWork;

const now = new Date('2026-09-28T03:00:00.000Z');
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function newUser(email = 'na@example.vn') {
  return User.register({ id: uuid(), email: email as Email, passwordHash: 'hash', now });
}
const consent = () => ({ id: uuid(), version: '2026-09-28', acceptedAt: now, ip: '203.0.113.9' });

function newRefresh(userId: string, familyId = uuid(), tokenHash = `hash-${uuid()}`) {
  return RefreshToken.issue({ id: uuid(), userId, familyId, tokenHash, userAgent: 'Safari', now });
}

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    imports: [ConfigModule, KernelModule, PersistenceModule, PrismaIdentityModule],
  }).compile();
  await moduleRef.init();
  prisma = moduleRef.get(PrismaService);
  users = moduleRef.get(USER_REPOSITORY);
  refreshTokens = moduleRef.get(REFRESH_TOKEN_REPOSITORY);
  resetTokens = moduleRef.get(PASSWORD_RESET_TOKEN_REPOSITORY);
  attempts = moduleRef.get(LOGIN_ATTEMPT_REPOSITORY);
  uow = moduleRef.get(UNIT_OF_WORK);
});

beforeEach(() => resetDatabase(prisma));
afterAll(() => moduleRef.close());

describe('PrismaUserRepository', () => {
  it('creates a user with its consent and reads it back by e-mail and id', async () => {
    const user = newUser();
    await users.create(user, consent());

    const byEmail = await users.findByEmail('na@example.vn');
    expect(byEmail).toMatchObject({
      id: user.id,
      email: 'na@example.vn',
      passwordHash: 'hash',
      timezone: 'Asia/Ho_Chi_Minh',
      deletedAt: null,
    });
    expect((await users.findById(user.id))?.email).toBe('na@example.vn');
    expect(await prisma.consent.findMany({ where: { userId: user.id } })).toEqual([
      expect.objectContaining({ version: '2026-09-28', ip: '203.0.113.9' }),
    ]);
  });

  it('returns null for unknown users', async () => {
    expect(await users.findByEmail('ghost@example.vn')).toBeNull();
    expect(await users.findById(uuid())).toBeNull();
  });

  it('TC-AUTH-002 turns a unique violation into EmailTakenError, even when only the case differs', async () => {
    await users.create(newUser('na@example.vn'), consent());
    await expect(users.create(newUser('NA@example.vn'), consent())).rejects.toThrow(
      EmailTakenError,
    );
  });

  it('lets exactly one of two concurrent registrations win', async () => {
    const results = await Promise.allSettled([
      users.create(newUser('race@example.vn'), consent()),
      users.create(newUser('race@example.vn'), consent()),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: expect.any(EmailTakenError),
    });
  });

  it('rethrows unexpected database errors', async () => {
    const user = newUser();
    await expect(users.create(user, { ...consent(), id: 'not-a-uuid' })).rejects.not.toBeInstanceOf(
      EmailTakenError,
    );
  });

  it('saves a password change and a soft delete', async () => {
    const user = newUser();
    await users.create(user, consent());
    user.changePassword('new-hash');
    user.delete(now);
    await users.save(user);
    expect(await users.findById(user.id)).toMatchObject({
      passwordHash: 'new-hash',
      deletedAt: now,
    });
  });
});

describe('PrismaRefreshTokenRepository', () => {
  it('stores, finds by hash and saves revocation', async () => {
    const user = newUser();
    await users.create(user, consent());
    const token = newRefresh(user.id, uuid(), 'the-hash');
    await refreshTokens.create(token);

    const found = await refreshTokens.findByHash('the-hash');
    expect(found).toMatchObject({ id: token.id, familyId: token.familyId, userAgent: 'Safari' });
    expect(found!.isUsable(now)).toBe(true);

    found!.revoke(now);
    await refreshTokens.save(found!);
    expect((await refreshTokens.findByHash('the-hash'))!.revokedAt).toEqual(now);
    expect(await refreshTokens.findByHash('nope')).toBeNull();
  });

  it('revokes one family only, or every token of a user', async () => {
    const user = newUser();
    await users.create(user, consent());
    const family = uuid();
    await refreshTokens.create(newRefresh(user.id, family, 'a'));
    await refreshTokens.create(newRefresh(user.id, family, 'b'));
    await refreshTokens.create(newRefresh(user.id, uuid(), 'c'));

    await refreshTokens.revokeFamily(family, now);
    expect((await refreshTokens.findByHash('a'))!.isRevoked).toBe(true);
    expect((await refreshTokens.findByHash('b'))!.isRevoked).toBe(true);
    expect((await refreshTokens.findByHash('c'))!.isRevoked).toBe(false);

    await refreshTokens.revokeAllForUser(user.id, now);
    expect((await refreshTokens.findByHash('c'))!.isRevoked).toBe(true);
  });

  it('rotateIfActive claims a live token exactly once and records the rotation', async () => {
    const user = newUser();
    await users.create(user, consent());
    const token = newRefresh(user.id, uuid(), 'claim');
    await refreshTokens.create(token);

    const outcomes = await Promise.all([
      refreshTokens.rotateIfActive(token.id, now),
      refreshTokens.rotateIfActive(token.id, now),
    ]);
    expect(outcomes.sort()).toEqual([false, true]);
    const stored = (await refreshTokens.findByHash('claim'))!;
    expect(stored.revokedAt).toEqual(now);
    expect(stored.rotatedAt).toEqual(now);
    expect(stored.isWithinReuseGrace(now)).toBe(true);
  });

  it('knows whether a family still has a live token', async () => {
    const user = newUser();
    await users.create(user, consent());
    const family = uuid();
    const live = newRefresh(user.id, family, 'live');
    await refreshTokens.create(live);
    expect(await refreshTokens.familyHasActiveToken(family, now)).toBe(true);
    expect(
      await refreshTokens.familyHasActiveToken(family, new Date(live.expiresAt.getTime() + 1)),
    ).toBe(false);
    await refreshTokens.revokeFamily(family, now);
    expect(await refreshTokens.familyHasActiveToken(family, now)).toBe(false);
    expect(await refreshTokens.familyHasActiveToken(uuid(), now)).toBe(false);
  });

  it('keeps the original revocation time when revoking again', async () => {
    const user = newUser();
    await users.create(user, consent());
    const family = uuid();
    await refreshTokens.create(newRefresh(user.id, family, 'a'));
    await refreshTokens.revokeFamily(family, now);
    await refreshTokens.revokeFamily(family, new Date(now.getTime() + 60_000));
    expect((await refreshTokens.findByHash('a'))!.revokedAt).toEqual(now);
  });
});

describe('PrismaPasswordResetTokenRepository', () => {
  it('stores, finds by hash and marks as used', async () => {
    const user = newUser();
    await users.create(user, consent());
    const token = PasswordResetToken.issue({ id: uuid(), userId: user.id, tokenHash: 'r', now });
    await resetTokens.create(token);

    const found = await resetTokens.findByHash('r');
    expect(found).toMatchObject({ id: token.id, usedAt: null });
    found!.markUsed(now);
    await resetTokens.save(found!);
    expect((await resetTokens.findByHash('r'))!.usedAt).toEqual(now);
    expect(await resetTokens.findByHash('nope')).toBeNull();
  });
});

describe('PrismaLoginAttemptRepository', () => {
  it('returns attempts for one e-mail since a point in time', async () => {
    const earlier = new Date(now.getTime() - 20 * 60_000);
    await attempts.record('na@example.vn', { succeeded: false, attemptedAt: earlier });
    await attempts.record('na@example.vn', { succeeded: true, attemptedAt: now });
    await attempts.record('bin@example.vn', { succeeded: false, attemptedAt: now });

    expect(await attempts.since('na@example.vn', new Date(now.getTime() - 15 * 60_000))).toEqual([
      { succeeded: true, attemptedAt: now },
    ]);
  });
});

describe('ClsUnitOfWork', () => {
  it('commits every write of a successful unit together', async () => {
    const user = newUser();
    await uow.run(async () => {
      await users.create(user, consent());
      await refreshTokens.create(newRefresh(user.id, uuid(), 'committed'));
    });
    expect(await refreshTokens.findByHash('committed')).not.toBeNull();
  });

  it('rolls back every write when the unit fails', async () => {
    const user = newUser();
    await expect(
      uow.run(async () => {
        await users.create(user, consent());
        await refreshTokens.create(newRefresh(user.id, uuid(), 'rolled-back'));
        throw new Error('boom after two writes');
      }),
    ).rejects.toThrow('boom after two writes');

    expect(await users.findById(user.id)).toBeNull();
    expect(await refreshTokens.findByHash('rolled-back')).toBeNull();
  });

  it('returns the value produced by the unit', async () => {
    await expect(uow.run(async () => 42)).resolves.toBe(42);
  });
});
