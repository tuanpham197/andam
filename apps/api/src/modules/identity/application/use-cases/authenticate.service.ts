import { Inject, Injectable } from '@nestjs/common';
import { InvalidAccessTokenError } from '../../domain/errors.js';
import { ACCESS_TOKENS, type AccessTokens } from '../ports/out/access-tokens.port.js';
import { USER_REPOSITORY, type UserRepository } from '../ports/out/user.repository.js';

/** Used by the global auth guard: a valid signature is not enough, the account must be active. */
@Injectable()
export class AuthenticateService {
  constructor(
    @Inject(ACCESS_TOKENS) private readonly accessTokens: AccessTokens,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async execute(input: { accessToken: string | undefined }): Promise<{ userId: string }> {
    const userId = input.accessToken ? await this.accessTokens.verify(input.accessToken) : null;
    const user = userId ? await this.users.findById(userId) : null;
    if (!user?.isActive) throw new InvalidAccessTokenError();
    return { userId: user.id };
  }
}
