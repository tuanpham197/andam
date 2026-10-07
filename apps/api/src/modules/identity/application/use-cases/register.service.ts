import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import { ID_GENERATOR, type IdGenerator } from '../../../../shared/kernel/id-generator.port.js';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/kernel/unit-of-work.port.js';
import { assertConsent } from '../../domain/consent.js';
import { parseEmail } from '../../domain/email.js';
import { EmailTakenError } from '../../domain/errors.js';
import { acceptablePassword } from '../../domain/password.js';
import { User } from '../../domain/user.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../ports/out/password-hasher.port.js';
import { USER_REPOSITORY, type UserRepository } from '../ports/out/user.repository.js';
import type { Session } from './session.js';
import { SessionStarter } from './session-starter.service.js';

export interface RegisterCommand {
  email: string;
  password: string;
  consentVersion?: string;
  userAgent: string | null;
  ip: string | null;
}

@Injectable()
export class RegisterService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SessionStarter) private readonly sessions: SessionStarter,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RegisterCommand): Promise<Session> {
    const email = parseEmail(command.email);
    assertConsent(command.consentVersion);
    const password = acceptablePassword(command.password);
    if (await this.users.findByEmail(email)) throw new EmailTakenError();

    const passwordHash = await this.hasher.hash(password);
    const now = this.clock.now();
    const user = User.register({ id: this.ids.next(), email, passwordHash, now });

    return this.uow.run(async () => {
      await this.users.create(user, {
        id: this.ids.next(),
        version: command.consentVersion!,
        acceptedAt: now,
        ip: command.ip,
      });
      return this.sessions.start({ userId: user.id, userAgent: command.userAgent });
    });
  }
}
