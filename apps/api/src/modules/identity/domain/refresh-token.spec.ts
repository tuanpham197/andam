import { REFRESH_TOKEN_TTL_MS, REUSE_GRACE_MS, RefreshToken } from './refresh-token.js';

const now = new Date('2026-09-28T10:00:00Z');

function issue() {
  return RefreshToken.issue({
    id: 't-1',
    userId: 'u-1',
    familyId: 'f-1',
    tokenHash: 'hash',
    userAgent: 'Safari',
    now,
  });
}

describe('RefreshToken', () => {
  it('lives 30 days', () => {
    expect(REFRESH_TOKEN_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(issue().expiresAt).toEqual(new Date(now.getTime() + REFRESH_TOKEN_TTL_MS));
  });

  it('starts usable and unrevoked', () => {
    const token = issue();
    expect(token.revokedAt).toBeNull();
    expect(token.isUsable(now)).toBe(true);
  });

  it('TC-AUTH-015 is unusable one millisecond after expiry but usable at the exact expiry', () => {
    const token = issue();
    expect(token.isUsable(token.expiresAt)).toBe(true);
    expect(token.isUsable(new Date(token.expiresAt.getTime() + 1))).toBe(false);
  });

  it('is unusable once revoked, and revoking twice keeps the first time', () => {
    const token = issue();
    const later = new Date(now.getTime() + 5000);
    token.revoke(now);
    token.revoke(later);
    expect(token.revokedAt).toEqual(now);
    expect(token.isRevoked).toBe(true);
    expect(token.isUsable(now)).toBe(false);
  });

  describe('rotation and the multi-tab grace period (TC-AUTH-029)', () => {
    it('lasts 10 seconds', () => {
      expect(REUSE_GRACE_MS).toBe(10_000);
    });

    it('rotating revokes the token and remembers when', () => {
      const token = issue();
      token.rotate(now);
      expect(token).toMatchObject({ isRevoked: true, revokedAt: now, rotatedAt: now });
    });

    it('allows reuse up to exactly 10 seconds after rotation', () => {
      const token = issue();
      token.rotate(now);
      expect(token.isWithinReuseGrace(new Date(now.getTime() + REUSE_GRACE_MS))).toBe(true);
      expect(token.isWithinReuseGrace(new Date(now.getTime() + REUSE_GRACE_MS + 1))).toBe(false);
    });

    it('gives no grace to a token revoked for another reason (logout, theft)', () => {
      const token = issue();
      token.revoke(now);
      expect(token.rotatedAt).toBeNull();
      expect(token.isWithinReuseGrace(now)).toBe(false);
    });

    it('gives no grace to a live token', () => {
      expect(issue().isWithinReuseGrace(now)).toBe(false);
    });
  });

  it('can be rebuilt from persistence', () => {
    const token = RefreshToken.restore({
      id: 't-2',
      userId: 'u-1',
      familyId: 'f-1',
      tokenHash: 'h2',
      userAgent: null,
      expiresAt: now,
      revokedAt: null,
      rotatedAt: null,
    });
    expect(token.isUsable(now)).toBe(true);
  });
});
