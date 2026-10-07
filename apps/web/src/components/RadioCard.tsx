import styles from './RadioCard.module.css';

export function RadioCard<V extends string>({
  name,
  value,
  title,
  description,
  checked,
  onChange,
}: {
  name: string;
  value: V;
  title: string;
  description?: string;
  checked: boolean;
  onChange: (value: V) => void;
}) {
  return (
    <label className={styles.card}>
      <input
        className={styles.input}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
      />
      <span>
        <span className={styles.title}>{title}</span>
        {description && <span className={styles.description}>{description}</span>}
      </span>
    </label>
  );
}
