export const ACCESS_TOKENS = Symbol('ACCESS_TOKENS');

export const ACCESS_TOKEN_TTL_MS = 15 * 60_000;

export interface AccessTokens {
  issue(userId: string, now: Date): Promise<{ token: string; expiresAt: Date }>;
  /** Returns the user id, or null for an invalid, tampered or expired token. */
  verify(token: string): Promise<string | null>;
}
