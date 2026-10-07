import { useId } from 'react';
import styles from './RatingScale.module.css';

export function RatingScale({
  label,
  value,
  onChange,
  lowLabel,
  highLabel,
}: {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
  lowLabel: string;
  highLabel: string;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id}>
      <div id={id} className={styles.legend}>
        {label}
      </div>
      <div className={styles.scale}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={styles.option}
            aria-label={`${n} trên 5`}
            aria-pressed={value === n}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className={styles.ends} aria-hidden="true">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}
