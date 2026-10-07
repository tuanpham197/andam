import {
  useGetChildHealth,
  usePreviewHealthMenu,
  useUpdateChildHealth,
  type HealthDto,
  type HealthPreviewDto,
  type UpdateHealthDtoStatus,
  type UpdateHealthDtoSymptomsItem,
} from '@appandam/api-client';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import layout from '../app/layout.module.css';
import { AlertBox } from '../components/AlertBox';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { LoadError } from '../components/LoadError';
import { RadioCard } from '../components/RadioCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { TextField } from '../components/TextField';
import { ToggleChip } from '../components/ToggleChip';
import { useActiveChild } from '../features/child/guards';
import { todayInVietnam } from '../features/meals/format';
import { messageFor } from '../lib/errors';
import { vi } from '../strings/vi';
import styles from './HealthPage.module.css';

const t = vi.healthPage;
const STATUSES = Object.keys(t.statusHints) as UpdateHealthDtoStatus[];
const SYMPTOMS = Object.keys(t.symptoms) as UpdateHealthDtoSymptomsItem[];

/** The preview as the parent reads it (FR-083). */
export function changeLines(preview: HealthPreviewDto): string[] {
  if (preview.status === 'normal') return [t.changes.fullMenu, t.changes.newFoodsOk];
  const lines: string[] = [];
  if (preview.extraSnacks > 0) lines.push(t.changes.splitMeals);
  else lines.push(t.changes.smallerPortions(preview.portionPercent));
  lines.push(preview.softerTexture > 0 ? t.changes.softer : t.changes.stageTexture);
  if (preview.pauseNewFoods) lines.push(t.changes.pauseNew);
  return lines;
}

function HealthForm({ current }: { current: HealthDto }) {
  const child = useActiveChild();
  const today = todayInVietnam(new Date());
  const [status, setStatus] = useState<UpdateHealthDtoStatus>(current.status);
  const [symptoms, setSymptoms] = useState<UpdateHealthDtoSymptomsItem[]>(current.symptoms);
  const [startDate, setStartDate] = useState(current.startDate ?? today);
  const [expectedEndDate, setExpectedEndDate] = useState(current.expectedEndDate ?? '');
  const preview = usePreviewHealthMenu(
    child.id,
    { status },
    { query: { placeholderData: keepPreviousData } },
  );
  const update = useUpdateChildHealth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const ill = status !== 'normal';
  const endTooEarly = ill && expectedEndDate !== '' && expectedEndDate < startDate;

  const toggle = (symptom: UpdateHealthDtoSymptomsItem) =>
    setSymptoms((list) =>
      list.includes(symptom) ? list.filter((s) => s !== symptom) : [...list, symptom],
    );

  async function save() {
    const saved = await update
      .mutateAsync({
        childId: child.id,
        data: ill
          ? { status, symptoms, startDate, expectedEndDate: expectedEndDate || null }
          : { status, symptoms: [] },
      })
      .catch(() => null);
    if (!saved) return;
    // Upcoming meals were re-planned: every view of this child is stale.
    await queryClient.invalidateQueries({
      predicate: (q) => String(q.queryKey[0]).startsWith(`/api/v1/children/${child.id}/`),
    });
    await navigate('/', { replace: true });
  }

  return (
    <>
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>{t.statusLegend}</legend>
        {STATUSES.map((value) => (
          <RadioCard
            key={value}
            name="health-status"
            value={value}
            title={vi.healthStatus[value]}
            description={t.statusHints[value]}
            checked={status === value}
            onChange={setStatus}
          />
        ))}
      </fieldset>

      {ill && (
        <>
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>{t.symptomsLegend}</legend>
            <div className={styles.chips}>
              {SYMPTOMS.map((symptom) => (
                <ToggleChip
                  key={symptom}
                  pressed={symptoms.includes(symptom)}
                  onPressedChange={() => toggle(symptom)}
                >
                  {t.symptoms[symptom]}
                </ToggleChip>
              ))}
            </div>
          </fieldset>
          <div className={styles.dates}>
            <TextField
              label={t.start}
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <TextField
              label={t.expectedEnd}
              type="date"
              value={expectedEndDate}
              min={startDate}
              hint={endTooEarly ? undefined : t.expectedEndHint}
              error={endTooEarly ? t.endBeforeStart : undefined}
              onChange={(e) => setExpectedEndDate(e.target.value)}
            />
          </div>
        </>
      )}

      <section aria-label={t.changesTitle} className={`${layout.card} ${styles.changes}`}>
        <h2 className={styles.changesTitle}>{t.changesTitle}</h2>
        {preview.data ? (
          <ul className={styles.changeList} aria-busy={preview.isPlaceholderData}>
            {changeLines(preview.data).map((line) => (
              <li key={line}>
                <Icon name="check" size={16} />
                {line}
              </li>
            ))}
          </ul>
        ) : preview.isError ? (
          <LoadError error={preview.error} retry={() => preview.refetch()} />
        ) : (
          <p role="status" className={styles.muted}>
            {t.updating}
          </p>
        )}
      </section>

      <AlertBox tone="danger">
        <span>{t.disclaimer}</span>{' '}
        <Link to="/urgent" className={styles.inlineLink}>
          {t.urgentLink}
        </Link>
      </AlertBox>

      {update.error && <AlertBox tone="danger">{messageFor(update.error)}</AlertBox>}
      <Button fullWidth loading={update.isPending} disabled={endTooEarly} onClick={save}>
        {t.submit}
      </Button>
    </>
  );
}

/** S09: the child's health, and how the menu will follow it (UC-11). */
export function HealthPage() {
  const child = useActiveChild();
  const current = useGetChildHealth(child.id);
  return (
    <>
      <ScreenHeader title="" back="/" />
      <h1 className={layout.title}>{t.title(child.name)}</h1>
      <p className={layout.intro}>{t.intro}</p>
      {current.data ? (
        <HealthForm current={current.data} />
      ) : current.isError ? (
        <LoadError error={current.error} retry={() => current.refetch()} />
      ) : (
        <p role="status" className={styles.muted}>
          {vi.common.loading}
        </p>
      )}
    </>
  );
}
