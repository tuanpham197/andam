import { useOpenUrgentEvent, useUpdateUrgentEvent } from '@appandam/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { AlertBox } from '../components/AlertBox';
import { Icon } from '../components/Icon';
import { useActiveChild } from '../features/child/guards';
import { invalidateChildData } from '../features/child/invalidate';
import { namesSentence, timeInVietnam } from '../features/meals/format';
import { vi } from '../strings/vi';
import styles from './UrgentPage.module.css';

const t = vi.urgent;

/**
 * S08 "Dấu hiệu nguy hiểm" (UC-10). The signs and the call button never wait for the network;
 * opening the screen records the event once and pauses the related foods (BR-41).
 */
export function UrgentPage() {
  const child = useActiveChild();
  const [params] = useSearchParams();
  const mealId = params.get('mealId');
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const open = useOpenUrgentEvent();
  const contact = useUpdateUrgentEvent();
  const started = useRef(false);

  function record() {
    open.mutate(
      { childId: child.id, data: { mealId } },
      { onSuccess: () => void invalidateChildData(queryClient, child.id) },
    );
  }

  useEffect(() => {
    // Once per visit, even when React runs effects twice in development.
    if (started.current) return;
    started.current = true;
    record();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const event = contact.data ?? open.data;
  const paused = open.data?.pausedIngredients ?? [];
  const back = () => (location.key === 'default' ? navigate('/') : navigate(-1));

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <button type="button" aria-label={vi.common.back} className={styles.back} onClick={back}>
          <Icon name="back" />
        </button>
        <div className={styles.mark} aria-hidden="true">
          <Icon name="pulse" size={28} />
        </div>
        <h1 className={styles.title}>{t.title}</h1>
      </div>
      <div className={styles.body}>
        <ul aria-label={t.signsLabel} className={styles.signs}>
          {t.signs.map((sign) => (
            <li key={sign}>{sign}</li>
          ))}
        </ul>
        <a href="tel:115" className={styles.call}>
          <Icon name="phone" />
          {t.call}
        </a>
        {event?.contactedMedicalAt ? (
          <AlertBox tone="info">{t.contactedAt(timeInVietnam(event.contactedMedicalAt))}</AlertBox>
        ) : (
          <button
            type="button"
            className={styles.contacted}
            disabled={!event || contact.isPending}
            onClick={() =>
              event && contact.mutate({ eventId: event.id, data: { contactedMedical: true } })
            }
          >
            {t.contacted}
          </button>
        )}
        {open.isPending && (
          <p role="status" className={styles.muted}>
            {t.pausing}
          </p>
        )}
        {open.isError && (
          <div className={styles.retry}>
            <AlertBox tone="danger">{t.notRecorded}</AlertBox>
            <button type="button" className={styles.contacted} onClick={record}>
              {t.retry}
            </button>
          </div>
        )}
        {paused.length > 0 && (
          <div className={styles.paused}>
            <strong>{t.pausedTitle}</strong>
            <span>{t.pausedText(namesSentence(paused.map((p) => p.name)))}</span>
          </div>
        )}
        <p className={styles.disclaimer}>{t.disclaimer}</p>
      </div>
    </div>
  );
}
