import { PASSWORD_RESET_TTL_MS, PasswordResetToken } from './password-reset-token.js';

const now = new Date('2026-09-28T10:00:00Z');

function issue() {
  return PasswordResetToken.issue({ id: 'r-1', userId: 'u-1', tokenHash: 'h', now });
}

describe('PasswordResetToken (TC-AUTH-019)', () => {
  it('lives 30 minutes', () => {
    expect(PASSWORD_RESET_TTL_MS).toBe(30 * 60_000);
    expect(issue().expiresAt).toEqual(new Date(now.getTime() + PASSWORD_RESET_TTL_MS));
  });

  it('is usable until it expires', () => {
    const token = issue();
    expect(token.isUsable(token.expiresAt)).toBe(true);
    expect(token.isUsable(new Date(token.expiresAt.getTime() + 1))).toBe(false);
  });

  it('is single-use', () => {
    const token = issue();
    token.markUsed(now);
    expect(token.usedAt).toEqual(now);
    expect(token.isUsable(now)).toBe(false);
  });

  it('can be rebuilt from persistence', () => {
    const token = PasswordResetToken.restore({
      id: 'r-2',
      userId: 'u-1',
      tokenHash: 'h',
      expiresAt: now,
      usedAt: now,
    });
    expect(token.isUsable(now)).toBe(false);
  });
});
