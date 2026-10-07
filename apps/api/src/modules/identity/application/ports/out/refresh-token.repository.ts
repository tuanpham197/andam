import type { RefreshToken } from '../../../domain/refresh-token.js';

export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');

export interface RefreshTokenRepository {
  create(token: RefreshToken): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshToken | null>;
  save(token: RefreshToken): Promise<void>;
  /** Atomically marks a still-active token as rotated; false when another request did it first. */
  rotateIfActive(id: string, now: Date): Promise<boolean>;
  /** True while at least one token of the family is neither revoked nor expired. */
  familyHasActiveToken(familyId: string, now: Date): Promise<boolean>;
  revokeFamily(familyId: string, now: Date): Promise<void>;
  revokeAllForUser(userId: string, now: Date): Promise<void>;
}
