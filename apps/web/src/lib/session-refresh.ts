import { ApiError, refreshSession } from '@appandam/api-client';
import {
  getSession,
  setAnonymous,
  setAuthenticated,
  setOffline,
} from '../features/auth/session-store';

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
    .catch((error: unknown) => {
      const { status } = getSession();
      // No answer from the server (no network, server down): nothing says the session is over.
      // At start-up the app opens on what it cached; in use, the current screen stays.
      const noAnswer = !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
      if (noAnswer) {
        if (status === 'unknown' || status === 'offline') setOffline();
        return false;
      }
      // Signed in a moment ago: the login screen says why the user is back there.
      setAnonymous(status === 'authenticated');
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
