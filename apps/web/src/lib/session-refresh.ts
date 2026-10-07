import { refreshSession } from '@appandam/api-client';
import { setAnonymous, setAuthenticated } from '../features/auth/session-store';

let inFlight: Promise<boolean> | null = null;

/**
 * Exchanges the refresh cookie for a new access token. Shared between callers (StrictMode
 * double effects, concurrent 401s): two requests with the same cookie look like token theft
 * to the API and would sign the user out.
 */
export function refreshSessionOnce(): Promise<boolean> {
  inFlight ??= refreshSession()
    .then((session) => {
      setAuthenticated(session.accessToken);
      return true;
    })
    .catch(() => {
      setAnonymous();
      return false;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Test isolation: drop a refresh that another test left pending. */
export function forgetPendingRefresh(): void {
  inFlight = null;
}
