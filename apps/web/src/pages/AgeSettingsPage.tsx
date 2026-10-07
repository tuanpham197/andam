import {
  getGetChildQueryKey,
  getListChildrenQueryKey,
  useListStages,
  usePreviewStage,
  useUpdateChild,
  type StageDto,
} from '@appandam/api-client';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import styles from '../app/layout.module.css';
import { AlertBox } from '../components/AlertBox';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { Disclaimer } from '../components/Disclaimer';
import { ScreenHeader } from '../components/ScreenHeader';
import { Switch } from '../components/Switch';
import { TextField } from '../components/TextField';
import { formatAge, stageRange, textureLabel } from '../features/child/format';
import { useActiveChild } from '../features/child/guards';
import { messageFor } from '../lib/errors';
import { vi } from '../strings/vi';

const t = vi.ageSettings;

function snacksText(stage: StageDto): string {
  if (stage.snacksMax === 0) return t.noSnack;
  return stage.snacksMin === stage.snacksMax
    ? `${stage.snacksMin} bữa`
    : `${stage.snacksMin}–${stage.snacksMax} bữa`;
}

export function AgeSettingsPage() {
  const child = useActiveChild();
  const stages = useListStages().data ?? [];
  const [birthDate, setBirthDate] = useState(child.birthDate);
  const [isPremature, setPremature] = useState(child.isPremature);
  const [weeksEarly, setWeeksEarly] = useState(child.isPremature ? child.weeksEarly : 2);
  const [stage, setStage] = useState<number | null>(child.stageOverride);
  const stagesLabel = useId();

  const preview = usePreviewStage(
    child.id,
    {
      birthDate,
      isPremature,
      ...(isPremature && Number.isFinite(weeksEarly) ? { weeksEarly } : {}),
      ...(stage !== null ? { stage } : {}),
    },
    { query: { placeholderData: keepPreviousData } },
  );
  const profile = preview.data ?? child;
  // The previous preview stays on screen while the next one loads; say so on slow networks.
  const updating = preview.isPlaceholderData && preview.isFetching;
  const update = useUpdateChild();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const applied = stages.find((s) => s.id === profile.effectiveStage);

  async function save() {
    const saved = await update
      .mutateAsync({
        childId: child.id,
        data: {
          birthDate,
          isPremature,
          weeksEarly: isPremature ? weeksEarly : 0,
          stageOverride: stage,
        },
      })
      .catch(() => null);
    if (!saved) return;
    await queryClient.invalidateQueries({ queryKey: getListChildrenQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getGetChildQueryKey(child.id) });
    await navigate('/', { replace: true });
  }

  return (
    <>
      <ScreenHeader title={t.header} back="/profile" />
      <h1 className={styles.title}>{t.title}</h1>
      <p className={styles.intro}>{t.intro}</p>

      <section
        className={styles.card}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <TextField
          label={t.birthDate}
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
        />
        <div aria-busy={updating}>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{t.planningAge}</div>
          <div style={{ fontWeight: 700, fontSize: '1.0625rem', opacity: updating ? 0.5 : 1 }}>
            {formatAge(profile.age)}
          </div>
          {updating && (
            <div role="status" style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              {t.updating}
            </div>
          )}
        </div>
        <Switch
          label={vi.onboarding.premature}
          description={
            <span style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              {vi.onboarding.prematureHint}
            </span>
          }
          checked={isPremature}
          onCheckedChange={(on) => {
            setPremature(on);
            setStage(null);
          }}
        />
        {isPremature && (
          <TextField
            label={vi.onboarding.weeksLabel}
            type="number"
            inputMode="numeric"
            min={1}
            max={16}
            value={Number.isFinite(weeksEarly) ? String(weeksEarly) : ''}
            onChange={(e) => setWeeksEarly(e.target.valueAsNumber)}
          />
        )}
        {preview.isError && <AlertBox tone="danger">{messageFor(preview.error)}</AlertBox>}
      </section>

      <section>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <h2 id={stagesLabel} style={{ fontSize: '1.25rem' }}>
            {t.stages}
          </h2>
          {profile.isOverride && (
            <Button variant="ghost" onClick={() => setStage(null)}>
              {t.backToAge}
            </Button>
          )}
        </div>
        <div
          role="group"
          aria-labelledby={stagesLabel}
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {profile.stages.map((state) => {
            const def = stages.find((s) => s.id === state.id);
            const label = def ? `${def.name} · ${stageRange(def)}` : `Giai đoạn ${state.id}`;
            return (
              <button
                key={state.id}
                type="button"
                aria-pressed={state.state === 'selected'}
                disabled={state.state === 'locked'}
                onClick={() => setStage(state.id === profile.autoStage ? null : state.id)}
                className={styles.card}
                style={{
                  textAlign: 'left',
                  cursor: state.state === 'locked' ? 'not-allowed' : 'pointer',
                  borderColor: state.state === 'selected' ? 'var(--primary)' : undefined,
                  background: state.state === 'selected' ? 'var(--primary-faint)' : undefined,
                  opacity: state.state === 'locked' ? 0.6 : 1,
                }}
              >
                <span
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    fontWeight: 600,
                  }}
                >
                  {label}
                  {state.id === profile.autoStage && <Chip tone="primary">{t.byAge}</Chip>}
                </span>
                <span
                  style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--text-muted)' }}
                >
                  {state.state === 'locked'
                    ? t.unlockAt(state.unlockAtMonths)
                    : t.hints[state.id - 1]}
                </span>
              </button>
            );
          })}
        </div>
        {profile.isOverride && (
          <div style={{ marginTop: 10 }}>
            <AlertBox tone="warn">{t.overrideWarning}</AlertBox>
          </div>
        )}
      </section>

      {!profile.plannable && (
        <AlertBox tone="info">
          {profile.notPlannableReason === 'too_old' ? t.tooOld : t.tooYoung}
        </AlertBox>
      )}
      {profile.plannable && applied && (
        <section aria-label={t.applied} className={styles.card}>
          <h2 style={{ fontSize: '1.0625rem', marginBottom: 8 }}>{t.applied}</h2>
          <dl
            style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 12px' }}
          >
            <dt>{t.texture}</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{textureLabel(applied.texture)}</dd>
            <dt>{t.portion}</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{applied.portionText}</dd>
            <dt>{t.mainMeals}</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{`${applied.mainMeals} bữa`}</dd>
            <dt>{t.snacks}</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{snacksText(applied)}</dd>
          </dl>
        </section>
      )}

      {update.error && <AlertBox tone="danger">{messageFor(update.error)}</AlertBox>}
      <Button fullWidth loading={update.isPending} disabled={preview.isError} onClick={save}>
        {t.save}
      </Button>
      <Disclaimer>{t.who}</Disclaimer>
    </>
  );
}
