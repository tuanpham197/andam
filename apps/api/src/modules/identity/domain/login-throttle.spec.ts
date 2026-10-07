import { LOCKOUT_WINDOW_MS, MAX_FAILED_ATTEMPTS, isLockedOut } from './login-throttle.js';

const now = new Date('2026-09-28T10:00:00Z');
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
const fail = (m: number) => ({ succeeded: false, attemptedAt: minutesAgo(m) });
const ok = (m: number) => ({ succeeded: true, attemptedAt: minutesAgo(m) });

describe('isLockedOut (TC-AUTH-010, NFR-018)', () => {
  it('uses 5 failures in 15 minutes', () => {
    expect(MAX_FAILED_ATTEMPTS).toBe(5);
    expect(LOCKOUT_WINDOW_MS).toBe(15 * 60_000);
  });

  it('is open with no attempts', () => {
    expect(isLockedOut([], now)).toBe(false);
  });

  it('is open after 4 failures', () => {
    expect(isLockedOut([fail(4), fail(3), fail(2), fail(1)], now)).toBe(false);
  });

  it('locks after the 5th failure inside the window', () => {
    expect(isLockedOut([fail(5), fail(4), fail(3), fail(2), fail(1)], now)).toBe(true);
  });

  it('ignores failures older than the window', () => {
    expect(isLockedOut([fail(16), fail(4), fail(3), fail(2), fail(1)], now)).toBe(false);
  });

  it('counts a failure exactly at the window edge', () => {
    expect(isLockedOut([fail(15), fail(4), fail(3), fail(2), fail(1)], now)).toBe(true);
  });

  it('only counts failures after the latest success', () => {
    expect(isLockedOut([fail(9), fail(8), fail(7), fail(6), ok(5), fail(1)], now)).toBe(false);
  });

  it('does not depend on input order', () => {
    expect(isLockedOut([fail(1), ok(5), fail(9), fail(8), fail(7), fail(6)], now)).toBe(false);
    expect(isLockedOut([fail(1), fail(2), ok(10), fail(3), fail(4), fail(5)], now)).toBe(true);
  });
});
