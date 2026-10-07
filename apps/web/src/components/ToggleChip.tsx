import type { ReactNode } from 'react';
import styles from './ToggleChip.module.css';

export function ToggleChip({
  pressed,
  onPressedChange,
  tone = 'primary',
  children,
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  tone?: 'primary' | 'danger';
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={`${styles.chip} ${tone === 'danger' ? styles.danger : ''}`}
      onClick={() => onPressedChange(!pressed)}
    >
      {children}
    </button>
  );
}
