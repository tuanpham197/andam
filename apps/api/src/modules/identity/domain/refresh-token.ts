export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * A just-rotated token may be presented again for this long (a second tab refreshing with the
 * same cookie) without being treated as theft (TC-AUTH-029).
 */
export const REUSE_GRACE_MS = 10_000;

interface RefreshTokenState {
  id: string;
  userId: string;
  /** Every rotation of one login shares a family; reuse of an old token revokes the family. */
  familyId: string;
  tokenHash: string;
  userAgent: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  /** Set only when the token was replaced by rotation (not by logout or theft response). */
  rotatedAt: Date | null;
}

export class RefreshToken {
  private constructor(private state: RefreshTokenState) {}

  static issue(input: {
    id: string;
    userId: string;
    familyId: string;
    tokenHash: string;
    userAgent: string | null;
    now: Date;
  }): RefreshToken {
    return new RefreshToken({
      id: input.id,
      userId: input.userId,
      familyId: input.familyId,
      tokenHash: input.tokenHash,
      userAgent: input.userAgent,
      expiresAt: new Date(input.now.getTime() + REFRESH_TOKEN_TTL_MS),
      revokedAt: null,
      rotatedAt: null,
    });
  }

  static restore(state: RefreshTokenState): RefreshToken {
    return new RefreshToken({ ...state });
  }

  get id() {
    return this.state.id;
  }
  get userId() {
    return this.state.userId;
  }
  get familyId() {
    return this.state.familyId;
  }
  get tokenHash() {
    return this.state.tokenHash;
  }
  get userAgent() {
    return this.state.userAgent;
  }
  get expiresAt() {
    return this.state.expiresAt;
  }
  get revokedAt() {
    return this.state.revokedAt;
  }
  get rotatedAt() {
    return this.state.rotatedAt;
  }
  get isRevoked() {
    return this.state.revokedAt !== null;
  }

  isUsable(now: Date): boolean {
    return !this.isRevoked && now.getTime() <= this.state.expiresAt.getTime();
  }

  revoke(now: Date): void {
    this.state.revokedAt ??= now;
  }

  rotate(now: Date): void {
    this.state.revokedAt = now;
    this.state.rotatedAt = now;
  }

  isWithinReuseGrace(now: Date): boolean {
    return (
      this.state.rotatedAt !== null &&
      now.getTime() - this.state.rotatedAt.getTime() <= REUSE_GRACE_MS
    );
  }
}
