import { EmailTakenError } from '../../src/modules/identity/domain/errors.js';
import type { LoginAttempt } from '../../src/modules/identity/domain/login-throttle.js';
import { PasswordResetToken } from '../../src/modules/identity/domain/password-reset-token.js';
import { RefreshToken } from '../../src/modules/identity/domain/refresh-token.js';
import { User } from '../../src/modules/identity/domain/user.js';
import {
  ACCESS_TOKEN_TTL_MS,
  type AccessTokens,
} from '../../src/modules/identity/application/ports/out/access-tokens.port.js';
import type { LoginAttemptRepository } from '../../src/modules/identity/application/ports/out/login-attempt.repository.js';
import type { Mailer } from '../../src/modules/identity/application/ports/out/mailer.port.js';
import type { PasswordHasher } from '../../src/modules/identity/application/ports/out/password-hasher.port.js';
import type { PasswordResetTokenRepository } from '../../src/modules/identity/application/ports/out/password-reset-token.repository.js';
import type { RefreshTokenRepository } from '../../src/modules/identity/application/ports/out/refresh-token.repository.js';
import type { SecureTokens } from '../../src/modules/identity/application/ports/out/secure-tokens.port.js';
import type {
  ConsentRecord,
  UserRepository,
} from '../../src/modules/identity/application/ports/out/user.repository.js';
import { AuthenticateService } from '../../src/modules/identity/application/use-cases/authenticate.service.js';
import { DeleteAccountService } from '../../src/modules/identity/application/use-cases/delete-account.service.js';
import { GetMeService } from '../../src/modules/identity/application/use-cases/get-me.service.js';
import { LoginService } from '../../src/modules/identity/application/use-cases/login.service.js';
import { LogoutService } from '../../src/modules/identity/application/use-cases/logout.service.js';
import { RefreshSessionService } from '../../src/modules/identity/application/use-cases/refresh-session.service.js';
import { RegisterService } from '../../src/modules/identity/application/use-cases/register.service.js';
import { RequestPasswordResetService } from '../../src/modules/identity/application/use-cases/request-password-reset.service.js';
import { ResetPasswordService } from '../../src/modules/identity/application/use-cases/reset-password.service.js';
import { SessionStarter } from '../../src/modules/identity/application/use-cases/session-starter.service.js';
import { FixedClock, ImmediateUnitOfWork, SequenceIds, type Snapshotable } from './kernel.js';

// Entities are mutable; repositories keep snapshots so tests notice a forgotten save().
const snapshotUser = (u: User) =>
  User.restore({
    id: u.id,
    email: u.email,
    passwordHash: u.passwordHash,
    timezone: u.timezone,
    createdAt: u.createdAt,
    deletedAt: u.deletedAt,
  });

const snapshotRefresh = (t: RefreshToken) =>
  RefreshToken.restore({
    id: t.id,
    userId: t.userId,
    familyId: t.familyId,
    tokenHash: t.tokenHash,
    userAgent: t.userAgent,
    expiresAt: t.expiresAt,
    revokedAt: t.revokedAt,
    rotatedAt: t.rotatedAt,
  });

const snapshotReset = (t: PasswordResetToken) =>
  PasswordResetToken.restore({
    id: t.id,
    userId: t.userId,
    tokenHash: t.tokenHash,
    expiresAt: t.expiresAt,
    usedAt: t.usedAt,
  });

export class InMemoryUsers implements UserRepository, Snapshotable {
  readonly rows = new Map<string, User>();
  readonly consents = new Map<string, ConsentRecord>();

  snapshot() {
    return {
      rows: new Map([...this.rows].map(([k, v]) => [k, snapshotUser(v)])),
      consents: new Map(this.consents),
    };
  }
  restore(state: unknown) {
    const { rows, consents } = state as ReturnType<InMemoryUsers['snapshot']>;
    this.rows.clear();
    rows.forEach((v, k) => this.rows.set(k, v));
    this.consents.clear();
    consents.forEach((v, k) => this.consents.set(k, v));
  }

  async findByEmail(email: string) {
    const user = [...this.rows.values()].find((u) => u.email === email);
    return user ? snapshotUser(user) : null;
  }
  async findById(id: string) {
    const user = this.rows.get(id);
    return user ? snapshotUser(user) : null;
  }
  async create(user: User, consent: ConsentRecord) {
    if ([...this.rows.values()].some((u) => u.email === user.email)) throw new EmailTakenError();
    this.rows.set(user.id, snapshotUser(user));
    this.consents.set(user.id, consent);
  }
  async save(user: User) {
    this.rows.set(user.id, snapshotUser(user));
  }
}

export class InMemoryRefreshTokens implements RefreshTokenRepository, Snapshotable {
  readonly rows = new Map<string, RefreshToken>();

  snapshot() {
    return new Map([...this.rows].map(([k, v]) => [k, snapshotRefresh(v)]));
  }
  restore(state: unknown) {
    this.rows.clear();
    (state as Map<string, RefreshToken>).forEach((v, k) => this.rows.set(k, v));
  }

  async create(token: RefreshToken) {
    this.rows.set(token.id, snapshotRefresh(token));
  }
  async findByHash(tokenHash: string) {
    const token = [...this.rows.values()].find((t) => t.tokenHash === tokenHash);
    return token ? snapshotRefresh(token) : null;
  }
  async save(token: RefreshToken) {
    this.rows.set(token.id, snapshotRefresh(token));
  }
  async rotateIfActive(id: string, now: Date) {
    const token = this.rows.get(id);
    if (!token || token.isRevoked) return false;
    token.rotate(now);
    return true;
  }
  async familyHasActiveToken(familyId: string, now: Date) {
    return [...this.rows.values()].some((t) => t.familyId === familyId && t.isUsable(now));
  }
  async revokeFamily(familyId: string, now: Date) {
    for (const t of this.rows.values()) if (t.familyId === familyId) t.revoke(now);
  }
  async revokeAllForUser(userId: string, now: Date) {
    for (const t of this.rows.values()) if (t.userId === userId) t.revoke(now);
  }
  active() {
    return [...this.rows.values()].filter((t) => !t.isRevoked);
  }
}

export class InMemoryResetTokens implements PasswordResetTokenRepository, Snapshotable {
  readonly rows = new Map<string, PasswordResetToken>();

  snapshot() {
    return new Map([...this.rows].map(([k, v]) => [k, snapshotReset(v)]));
  }
  restore(state: unknown) {
    this.rows.clear();
    (state as Map<string, PasswordResetToken>).forEach((v, k) => this.rows.set(k, v));
  }
  async create(token: PasswordResetToken) {
    this.rows.set(token.id, snapshotReset(token));
  }
  async findByHash(tokenHash: string) {
    const token = [...this.rows.values()].find((t) => t.tokenHash === tokenHash);
    return token ? snapshotReset(token) : null;
  }
  async save(token: PasswordResetToken) {
    this.rows.set(token.id, snapshotReset(token));
  }
}

export class InMemoryLoginAttempts implements LoginAttemptRepository {
  readonly rows: { email: string; attempt: LoginAttempt }[] = [];
  async record(email: string, attempt: LoginAttempt) {
    this.rows.push({ email, attempt });
  }
  async since(email: string, from: Date) {
    return this.rows
      .filter((r) => r.email === email && r.attempt.attemptedAt >= from)
      .map((r) => r.attempt);
  }
}

/** Deterministic stand-in for argon2; counts calls to check timing-equalisation (TC-AUTH-009). */
export class FakeHasher implements PasswordHasher {
  hashCalls = 0;
  verifyCalls = 0;
  async hash(password: string) {
    this.hashCalls += 1;
    return `hashed:${password}`;
  }
  async verify(hash: string, password: string) {
    this.verifyCalls += 1;
    return hash === `hashed:${password}`;
  }
}

export class FakeAccessTokens implements AccessTokens {
  private n = 0;
  async issue(userId: string, now: Date) {
    this.n += 1;
    return {
      token: `access.${userId}.${this.n}`,
      expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS),
    };
  }
  async verify(token: string) {
    const [prefix, userId] = token.split('.');
    return prefix === 'access' && userId ? userId : null;
  }
}

export class FakeSecureTokens implements SecureTokens {
  private n = 0;
  generate() {
    this.n += 1;
    return `secret-${this.n}`;
  }
  hash(token: string) {
    return `sha256(${token})`;
  }
}

export class RecordingMailer implements Mailer {
  readonly sent: { to: string; resetUrl: string }[] = [];
  async sendPasswordReset(input: { to: string; resetUrl: string }) {
    this.sent.push(input);
  }
}

export function identityTestbed() {
  const clock = new FixedClock(new Date('2026-09-28T03:00:00Z'));
  const ids = new SequenceIds();
  const users = new InMemoryUsers();
  const refreshTokens = new InMemoryRefreshTokens();
  const resetTokens = new InMemoryResetTokens();
  const uow = new ImmediateUnitOfWork().track(users, refreshTokens, resetTokens);
  const attempts = new InMemoryLoginAttempts();
  const hasher = new FakeHasher();
  const accessTokens = new FakeAccessTokens();
  const secureTokens = new FakeSecureTokens();
  const mailer = new RecordingMailer();
  const settings = { webBaseUrl: 'https://thucdon.test' };

  const sessions = new SessionStarter(refreshTokens, accessTokens, secureTokens, ids, clock);

  return {
    clock,
    ids,
    uow,
    users,
    refreshTokens,
    resetTokens,
    attempts,
    hasher,
    accessTokens,
    secureTokens,
    mailer,
    settings,
    sessions,
    register: new RegisterService(users, sessions, hasher, ids, clock, uow),
    login: new LoginService(users, attempts, hasher, sessions, clock),
    refresh: new RefreshSessionService(refreshTokens, users, sessions, secureTokens, clock, uow),
    logout: new LogoutService(refreshTokens, secureTokens, clock),
    requestReset: new RequestPasswordResetService(
      users,
      resetTokens,
      secureTokens,
      mailer,
      ids,
      clock,
      settings,
    ),
    resetPassword: new ResetPasswordService(
      resetTokens,
      users,
      refreshTokens,
      hasher,
      secureTokens,
      clock,
      uow,
    ),
    getMe: new GetMeService(users),
    deleteAccount: new DeleteAccountService(users, hasher, refreshTokens, clock, uow),
    authenticate: new AuthenticateService(accessTokens, users),
  };
}

export type IdentityTestbed = ReturnType<typeof identityTestbed>;

export const PASSWORD = 'Cháo cá hồi 2026';

export async function registered(t: IdentityTestbed, email = 'na@example.vn') {
  return t.register.execute({
    email,
    password: PASSWORD,
    consentVersion: '2026-09-28',
    userAgent: 'Safari',
    ip: '203.0.113.9',
  });
}
