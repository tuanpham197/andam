import {
  useListPausedIngredients,
  useResumeIngredient,
  type MealDtoSlot,
  type PausedIngredientDto,
} from '@appandam/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AlertBox } from '../../components/AlertBox';
import { Button } from '../../components/Button';
import { LoadError } from '../../components/LoadError';
import { messageFor } from '../../lib/errors';
import { vi } from '../../strings/vi';
import { invalidateChildData } from '../child/invalidate';
import { shortDate, slotLabel, todayInVietnam } from '../meals/format';
import styles from './PausedFoods.module.css';

const t = vi.paused;

function PausedRow({
  childId,
  pause,
  canResume,
}: {
  childId: string;
  pause: PausedIngredientDto;
  canResume: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const resume = useResumeIngredient();
  const queryClient = useQueryClient();
  const since = t.since(shortDate(todayInVietnam(new Date(pause.pausedAt))));
  const source = pause.meal
    ? `${pause.meal.dishName} · ${slotLabel(pause.meal.slot as MealDtoSlot)}`
    : null;

  async function confirm() {
    const done = await resume.mutateAsync({ childId, ingredientId: pause.ingredientId }).then(
      () => true,
      () => false,
    );
    if (done) await invalidateChildData(queryClient, childId);
  }

  return (
    <li className={styles.row}>
      <div className={styles.text}>
        <span className={styles.name}>{pause.name}</span>
        <span className={styles.meta}>
          {[t.reasons[pause.reason as keyof typeof t.reasons], since].join(' · ')}
        </span>
        {source && <span className={styles.meta}>{source}</span>}
      </div>
      {!canResume ? null : confirming ? (
        <div className={styles.confirm}>
          <AlertBox tone="warn">{t.confirm(pause.name)}</AlertBox>
          {resume.error && <AlertBox tone="danger">{messageFor(resume.error)}</AlertBox>}
          <div className={styles.actions}>
            <Button onClick={confirm} loading={resume.isPending}>
              {t.confirmYes}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              {t.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          aria-label={t.resumeLabel(pause.name)}
          onClick={() => setConfirming(true)}
        >
          {t.resume}
        </Button>
      )}
    </li>
  );
}

/** G08: foods paused after a reaction or an urgent event; only a deliberate confirmation resumes one (BR-42). */
export function PausedFoods({ childId, canResume }: { childId: string; canResume: boolean }) {
  const list = useListPausedIngredients(childId);
  return (
    <section aria-label={t.title} className={styles.card}>
      <h2 className={styles.title}>{t.title}</h2>
      {list.isPending ? (
        <p role="status" className={styles.meta}>
          {vi.common.loading}
        </p>
      ) : list.isError ? (
        <LoadError error={list.error} retry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <p className={styles.meta}>{t.empty}</p>
      ) : (
        <ul className={styles.list}>
          {list.data.map((pause) => (
            <PausedRow key={pause.id} childId={childId} pause={pause} canResume={canResume} />
          ))}
        </ul>
      )}
    </section>
  );
}
