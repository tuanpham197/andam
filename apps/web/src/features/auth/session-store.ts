import { useSyncExternalStore } from 'react';

export type SessionStatus = 'unknown' | 'authenticated' | 'anonymous';

interface SessionState {
  status: SessionStatus;
  /** Kept in memory only, never in localStorage (docs §7.9). */
  accessToken: string | null;
}

const initial: SessionState = { status: 'unknown', accessToken: null };
let state = initial;
const listeners = new Set<() => void>();

function set(next: SessionState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export const getSession = () => state;
export const setAuthenticated = (accessToken: string) =>
  set({ status: 'authenticated', accessToken });
export const setAnonymous = () => set({ status: 'anonymous', accessToken: null });
export const resetSession = () => set(initial);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, getSession);
}
