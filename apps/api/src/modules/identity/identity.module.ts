import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AUTHENTICATOR } from '../../shared/auth/authenticator.port.js';
import { ENV } from '../../shared/infrastructure/config/config.module.js';
import type { Env } from '../../shared/infrastructure/config/env.js';
import { ChildProfileModule } from '../child-profile/child-profile.module.js';
import { AuthController } from './adapters/in/http/auth.controller.js';
import { MeController } from './adapters/in/http/me.controller.js';
import { AccountChildrenAdapter } from './adapters/out/cross-module/account-children.adapter.js';
import { createMailer } from './adapters/out/mail/nodemailer-mailer.js';
import { PrismaIdentityModule } from './adapters/out/persistence/prisma-identity.module.js';
import { Argon2PasswordHasher } from './adapters/out/security/argon2-password-hasher.js';
import { JwtAccessTokens } from './adapters/out/security/jwt-access-tokens.js';
import { NodeSecureTokens } from './adapters/out/security/node-secure-tokens.js';
import { ACCESS_TOKENS } from './application/ports/out/access-tokens.port.js';
import { ACCOUNT_CHILDREN } from './application/ports/out/account-children.port.js';
import { IDENTITY_SETTINGS } from './application/ports/out/identity-settings.port.js';
import { MAILER } from './application/ports/out/mailer.port.js';
import { PASSWORD_HASHER } from './application/ports/out/password-hasher.port.js';
import { SECURE_TOKENS } from './application/ports/out/secure-tokens.port.js';
import { AuthenticateService } from './application/use-cases/authenticate.service.js';
import { DeleteAccountService } from './application/use-cases/delete-account.service.js';
import { GetMeService } from './application/use-cases/get-me.service.js';
import { LoginService } from './application/use-cases/login.service.js';
import { LogoutService } from './application/use-cases/logout.service.js';
import { RefreshSessionService } from './application/use-cases/refresh-session.service.js';
import { RegisterService } from './application/use-cases/register.service.js';
import { RequestPasswordResetService } from './application/use-cases/request-password-reset.service.js';
import { ResetPasswordService } from './application/use-cases/reset-password.service.js';
import { SessionStarter } from './application/use-cases/session-starter.service.js';

@Module({
  imports: [
    PrismaIdentityModule,
    ChildProfileModule,
    JwtModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({ secret: env.JWT_SECRET }),
    }),
  ],
  controllers: [AuthController, MeController],
  providers: [
    SessionStarter,
    RegisterService,
    LoginService,
    RefreshSessionService,
    LogoutService,
    RequestPasswordResetService,
    ResetPasswordService,
    GetMeService,
    DeleteAccountService,
    AuthenticateService,
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: ACCESS_TOKENS, useClass: JwtAccessTokens },
    { provide: SECURE_TOKENS, useClass: NodeSecureTokens },
    { provide: ACCOUNT_CHILDREN, useClass: AccountChildrenAdapter },
    {
      provide: MAILER,
      inject: [ENV],
      useFactory: (env: Env) => createMailer(env.SMTP_URL, env.MAIL_FROM),
    },
    {
      provide: IDENTITY_SETTINGS,
      inject: [ENV],
      useFactory: (env: Env) => ({ webBaseUrl: env.WEB_BASE_URL }),
    },
    { provide: AUTHENTICATOR, useExisting: AuthenticateService },
  ],
  exports: [AUTHENTICATOR],
})
export class IdentityModule {}
