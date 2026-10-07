import type { ReactNode } from 'react';
import { Outlet } from 'react-router';
import { BottomNav } from '../components/BottomNav';
import { vi } from '../strings/vi';
import styles from './layout.module.css';

export function Splash() {
  return (
    <div className={styles.splash} role="status">
      {vi.common.loading}
    </div>
  );
}

/** Signed-in area: content + the 5-tab bottom navigation. */
export function AppShell() {
  return (
    <div className={styles.shell}>
      <main className={styles.main}>
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}

/** Auth screens and public pages: no navigation bar. */
export function PlainShell({ children }: { children?: ReactNode }) {
  return (
    <div className={styles.shell}>
      <main className={styles.main}>{children ?? <Outlet />}</main>
    </div>
  );
}

/** Full-bleed screens that lay out their own padding (S03 photo header). */
export function BareShell() {
  return (
    <div className={styles.shell}>
      <main className={styles.bare}>
        <Outlet />
      </main>
    </div>
  );
}
