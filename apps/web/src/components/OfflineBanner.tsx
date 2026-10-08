import { useSyncExternalStore } from 'react';
import { vi } from '../strings/vi';
import styles from './OfflineBanner.module.css';

function subscribe(listener: () => void) {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine);
}

/** NFR-008: offline, what was loaded stays readable; saving needs the network. */
export function OfflineBanner() {
  if (useOnline()) return null;
  return (
    <div role="status" className={styles.banner}>
      {vi.common.offline}
    </div>
  );
}
