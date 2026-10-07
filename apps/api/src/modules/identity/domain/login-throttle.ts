export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_WINDOW_MS = 15 * 60_000;

export interface LoginAttempt {
  succeeded: boolean;
  attemptedAt: Date;
}

/** Locked when 5 failures happened in the last 15 minutes since the latest success (NFR-018). */
export function isLockedOut(attempts: readonly LoginAttempt[], now: Date): boolean {
  const windowStart = now.getTime() - LOCKOUT_WINDOW_MS;
  const recent = attempts
    .filter((a) => a.attemptedAt.getTime() >= windowStart)
    .sort((a, b) => a.attemptedAt.getTime() - b.attemptedAt.getTime());

  let failuresSinceSuccess = 0;
  for (const attempt of recent) {
    failuresSinceSuccess = attempt.succeeded ? 0 : failuresSinceSuccess + 1;
  }
  return failuresSinceSuccess >= MAX_FAILED_ATTEMPTS;
}
