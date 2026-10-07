import type { ReactNode } from 'react';
import { Link } from 'react-router';
import styles from './Chip.module.css';

export function Chip({
  tone = 'neutral',
  to,
  children,
}: {
  tone?: 'neutral' | 'primary' | 'danger' | 'warn';
  /** Makes the chip a shortcut to the screen that changes it (S01 → S10, S09). */
  to?: string;
  children: ReactNode;
}) {
  const className = `${styles.chip} ${styles[tone]}`;
  return to ? (
    <Link to={to} className={`${className} ${styles.link}`}>
      {children}
    </Link>
  ) : (
    <span className={className}>{children}</span>
  );
}
