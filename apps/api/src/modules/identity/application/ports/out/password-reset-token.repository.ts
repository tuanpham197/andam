import type { PasswordResetToken } from '../../../domain/password-reset-token.js';

export const PASSWORD_RESET_TOKEN_REPOSITORY = Symbol('PASSWORD_RESET_TOKEN_REPOSITORY');

export interface PasswordResetTokenRepository {
  create(token: PasswordResetToken): Promise<void>;
  findByHash(tokenHash: string): Promise<PasswordResetToken | null>;
  save(token: PasswordResetToken): Promise<void>;
}
