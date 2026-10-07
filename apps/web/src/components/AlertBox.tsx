import type { ReactNode } from 'react';
import styles from './AlertBox.module.css';

export function AlertBox({
  tone,
  title,
  children,
}: {
  tone: 'warn' | 'danger' | 'info';
  title?: string;
  children: ReactNode;
}) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`${styles.box} ${styles[tone]}`}>
      <div>
        {title && <strong className={styles.title}>{title}</strong>}
        {title && ' '}
        {children}
      </div>
    </div>
  );
}
