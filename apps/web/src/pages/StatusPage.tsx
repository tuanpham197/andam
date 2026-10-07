import styles from '../app/layout.module.css';
import { HealthStatus } from '../features/health/HealthStatus';
import { vi } from '../strings/vi';

export function StatusPage() {
  return (
    <>
      <h1 className={styles.title}>{vi.appName}</h1>
      <HealthStatus />
    </>
  );
}
