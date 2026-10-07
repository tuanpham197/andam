import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import { normalizeEmail } from '../../domain/email.js';
import { InvalidCredentialsError, TooManyAttemptsError } from '../../domain/errors.js';
import { LOCKOUT_WINDOW_MS, isLockedOut } from '../../domain/login-throttle.js';
import {
  LOGIN_ATTEMPT_REPOSITORY,
  type LoginAttemptRepository,
} from '../ports/out/login-attempt.repository.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../ports/out/password-hasher.port.js';
import { USER_REPOSITORY, type UserRepository } from '../ports/out/user.repository.js';
import type { Session } from './session.js';
import { SessionStarter } from './session-starter.service.js';

export interface LoginCommand {
  email: string;
  password: string;
  userAgent: string | null;
}

@Injectable()
export class LoginService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(LOGIN_ATTEMPT_REPOSITORY) private readonly attempts: LoginAttemptRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(SessionStarter) private readonly sessions: SessionStarter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: LoginCommand): Promise<Session> {
    const email = normalizeEmail(command.email);
    const password = command.password.normalize('NFC');
    const now = this.clock.now();

    const recent = await this.attempts.since(email, new Date(now.getTime() - LOCKOUT_WINDOW_MS));
    if (isLockedOut(recent, now)) throw new TooManyAttemptsError();

    const user = await this.users.findByEmail(email);
    const valid =
      user?.isActive === true
        ? await this.hasher.verify(user.passwordHash, password)
        : // Spend the same hashing time for unknown accounts (TC-AUTH-009).
          await this.hasher.hash(password).then(() => false);

    await this.attempts.record(email, { succeeded: valid, attemptedAt: now });
    if (!valid) throw new InvalidCredentialsError();

    return this.sessions.start({ userId: user!.id, userAgent: command.userAgent });
  }
}
