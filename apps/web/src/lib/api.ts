import { configureApiClient } from '@appandam/api-client';
import { getSession } from '../features/auth/session-store';
import { refreshSessionOnce } from './session-refresh';

/** Same-origin by default (Vite proxies /api in dev); VITE_API_BASE_URL points elsewhere. */
export function setupApiClient(): void {
  configureApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL || window.location.origin,
    auth: {
      getAccessToken: () => getSession().accessToken,
      refreshAccessToken: refreshSessionOnce,
    },
  });
}
