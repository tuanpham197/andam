import { Module } from '@nestjs/common';
import { LOGIN_ATTEMPT_REPOSITORY } from '../../../application/ports/out/login-attempt.repository.js';
import { PASSWORD_RESET_TOKEN_REPOSITORY } from '../../../application/ports/out/password-reset-token.repository.js';
import { REFRESH_TOKEN_REPOSITORY } from '../../../application/ports/out/refresh-token.repository.js';
import { USER_REPOSITORY } from '../../../application/ports/out/user.repository.js';
import { PrismaLoginAttemptRepository } from './prisma-login-attempt.repository.js';
import { PrismaPasswordResetTokenRepository } from './prisma-password-reset-token.repository.js';
import { PrismaRefreshTokenRepository } from './prisma-refresh-token.repository.js';
import { PrismaUserRepository } from './prisma-user.repository.js';

const repositories = [
  { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
  { provide: REFRESH_TOKEN_REPOSITORY, useClass: PrismaRefreshTokenRepository },
  { provide: PASSWORD_RESET_TOKEN_REPOSITORY, useClass: PrismaPasswordResetTokenRepository },
  { provide: LOGIN_ATTEMPT_REPOSITORY, useClass: PrismaLoginAttemptRepository },
];

/** Prisma implementations of the identity output ports. */
@Module({
  providers: repositories,
  exports: repositories.map((r) => r.provide),
})
export class PrismaIdentityModule {}
