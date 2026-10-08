import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { QueryClient, type Query } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { getSession, subscribeSession } from '../features/auth/session-store';

const DAY_MS = 24 * 60 * 60 * 1000;
export const CACHE_KEY = 'thucdon-cache';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // Kept as long as the persisted copy, so the last menu stays readable offline (NFR-008).
      queries: { gcTime: DAY_MS },
      // Saving needs the network: fail at once with a message instead of waiting silently.
      mutations: { networkMode: 'always' },
    },
  });
}

/**
 * NFR-008 needs today's and this week's menu and the recipes opened, plus what the screens
 * around them read (children, stages, health). Nothing else is written to the device: not the
 * account, not invite links (their token is a credential), not other members' e-mails.
 */
const OFFLINE_READABLE = [
  /^\/api\/v1\/stages$/,
  /^\/api\/v1\/children$/,
  /^\/api\/v1\/children\/[^/]+$/,
  /^\/api\/v1\/children\/[^/]+\/(days|weeks|dishes)\/[^/]+$/,
  /^\/api\/v1\/children\/[^/]+\/health$/,
];

export const shouldPersist = (query: Query) =>
  query.state.status === 'success' &&
  OFFLINE_READABLE.some((pattern) => pattern.test(String(query.queryKey[0])));

/**
 * The menu, recipes and journal survive a reload without network. Stored on this device only
 * and erased as soon as nobody is signed in (sign out, account closed, session expired).
 */
export function persistOptions(
  client: QueryClient,
  storage: Storage | undefined = globalThis.localStorage,
): Omit<PersistQueryClientOptions, 'queryClient'> {
  const persister = createSyncStoragePersister({ storage, key: CACHE_KEY });
  subscribeSession(() => {
    if (getSession().status !== 'anonymous') return;
    client.clear();
    storage?.removeItem(CACHE_KEY);
  });
  return { persister, maxAge: DAY_MS, dehydrateOptions: { shouldDehydrateQuery: shouldPersist } };
}
