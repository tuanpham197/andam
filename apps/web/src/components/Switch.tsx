import { useId, type ReactNode } from 'react';
import styles from './Switch.module.css';

export function Switch({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className={styles.row}>
      <span>
        <span id={id}>{label}</span>
        {description}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        className={styles.track}
        onClick={() => onCheckedChange(!checked)}
      >
        <span className={styles.thumb} />
      </button>
    </div>
  );
}
