import { useSyncExternalStore } from 'react';

/** `offline`: opened without a network; cached data shows until the session can be checked. */
export type SessionStatus = 'unknown' | 'authenticated' | 'anonymous' | 'offline';

interface SessionState {
  status: SessionStatus;
  /** Kept in memory only, never in localStorage (docs §7.9). */
  accessToken: string | null;
  /** The session ended on its own (refresh refused) rather than by signing out. */
  expired: boolean;
}

const initial: SessionState = { status: 'unknown', accessToken: null, expired: false };
let state = initial;
const listeners = new Set<() => void>();

function set(next: SessionState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export const getSession = () => state;
export const setAuthenticated = (accessToken: string) =>
  set({ status: 'authenticated', accessToken, expired: false });
export const setAnonymous = (expired = false) =>
  set({ status: 'anonymous', accessToken: null, expired });
export const setOffline = () => set({ status: 'offline', accessToken: null, expired: false });
export const resetSession = () => set(initial);

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribeSession, getSession);
}
