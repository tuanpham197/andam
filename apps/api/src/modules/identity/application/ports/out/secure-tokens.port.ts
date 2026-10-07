export const SECURE_TOKENS = Symbol('SECURE_TOKENS');

/** Opaque random secrets (refresh / reset tokens); only their hash is ever stored. */
export interface SecureTokens {
  generate(): string;
  hash(token: string): string;
}
