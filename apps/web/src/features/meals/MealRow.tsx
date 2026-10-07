import type { MealDtoSlot } from '@appandam/api-client';
import { Link } from 'react-router';
import { Icon } from '../../components/Icon';
import { slotLabel } from './format';
import styles from './MealRow.module.css';

export type MealRowState = 'next' | 'pending' | 'eaten' | 'closed' | 'empty';

/** One line of the day: time and slot, the dish, and where the meal stands. */
export function MealRow({
  time,
  slot,
  name,
  note,
  state,
  to,
}: {
  time: string;
  slot: MealDtoSlot;
  name: string;
  note: string;
  state: MealRowState;
  /** The recipe; a slot without a dish has nothing to open. */
  to?: string;
}) {
  const content = (
    <>
      <span className={styles.when}>
        <span className={styles.time}>{time}</span>
        <span>{slotLabel(slot)}</span>
      </span>
      <span className={styles.body}>
        <span className={styles.name}>{name}</span>
        <span className={styles.note}>{note}</span>
      </span>
      {state === 'eaten' ? (
        <span className={styles.badge} aria-hidden="true">
          <Icon name="check" size={16} />
        </span>
      ) : (
        to && <Icon name="chevronRight" size={18} />
      )}
    </>
  );
  const className = `${styles.row} ${styles[state]}`;
  return to ? (
    <Link to={to} className={className} aria-current={state === 'next' ? 'step' : undefined}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
