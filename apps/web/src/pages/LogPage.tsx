import {
  useGetMealLog,
  useLogMeal,
  type LogDto,
  type LogFormDto,
  type LogMealDtoAmount,
  type MealDtoSlot,
  type ReactionInputDtoSeverity,
  type ReactionInputDtoSymptomsItem,
} from '@appandam/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { AlertBox } from '../components/AlertBox';
import { Icon } from '../components/Icon';
import { LoadError } from '../components/LoadError';
import { RatingScale } from '../components/RatingScale';
import { ToggleChip } from '../components/ToggleChip';
import { invalidateChildData } from '../features/child/invalidate';
import { useActiveChild } from '../features/child/guards';
import {
  firstTryNames,
  namesSentence,
  slotLabel,
  timeInVietnam,
  todayInVietnam,
} from '../features/meals/format';
import { errorCode, messageFor } from '../lib/errors';
import { clearDraft, loadDraft, saveDraft } from '../lib/session-draft';
import { vi } from '../strings/vi';
import styles from './LogPage.module.css';

const t = vi.log;
const AMOUNTS = Object.keys(t.amounts) as LogMealDtoAmount[];
const SYMPTOMS = Object.keys(t.symptoms) as ReactionInputDtoSymptomsItem[];
const SEVERITIES = Object.keys(t.severities) as ReactionInputDtoSeverity[];
/** Signs that call for "Dấu hiệu nguy hiểm" now rather than a note for later (UC-09 3b). */
const ALARMING = new Set<ReactionInputDtoSymptomsItem>(['breathing', 'swelling']);
const NOTE_MAX = 500;

interface Draft {
  time: string;
  amount: LogMealDtoAmount | null;
  liking: number | null;
  symptoms: ReactionInputDtoSymptomsItem[];
  severity: ReactionInputDtoSeverity;
  note: string;
}

const draftKey = (mealId: string) => `log-draft:${mealId}`;

function emptyDraft(form: LogFormDto): Draft {
  const now = new Date();
  // Logging today: the time is now; a meal of a past day keeps its planned time.
  const time = form.meal.date === todayInVietnam(now) ? timeInVietnam(now) : form.meal.time;
  return { time, amount: null, liking: null, symptoms: [], severity: 'unknown', note: '' };
}

function Summary({ log }: { log: LogDto }) {
  return (
    <div className={styles.stack}>
      <AlertBox tone="info">
        {t.loggedBy(log.loggedBy ?? t.deletedUser, timeInVietnam(log.loggedAt))}
      </AlertBox>
      <dl className={styles.summary}>
        <div>
          <dt>{t.amountLegend}</dt>
          <dd>{t.amounts[log.amount as LogMealDtoAmount]}</dd>
        </div>
        <div>
          <dt>{t.likingLabel}</dt>
          <dd>{t.liking(log.liking)}</dd>
        </div>
        {log.reaction && (
          <div>
            <dt>{t.reactionLabel}</dt>
            <dd>
              {[
                ...log.reaction.symptoms.map((s) => t.symptoms[s as ReactionInputDtoSymptomsItem]),
                t.severities[log.reaction.severity as ReactionInputDtoSeverity],
              ].join(' · ')}
              {log.reaction.note && <span className={styles.noteText}>{log.reaction.note}</span>}
            </dd>
          </div>
        )}
      </dl>
      <Link to="/" className={styles.textLink}>
        {t.backHome}
      </Link>
    </div>
  );
}

function Saved({ paused }: { paused: { id: string; name: string }[] }) {
  return (
    <div className={styles.stack}>
      <h2 className={styles.savedTitle}>
        <Icon name="check" /> {t.savedTitle}
      </h2>
      {paused.length > 0 && (
        <div className={styles.pauseBox}>{t.paused(namesSentence(paused.map((p) => p.name)))}</div>
      )}
      <Link to="/" className={styles.primaryLink}>
        {t.backHome}
      </Link>
    </div>
  );
}

function LogForm({
  form,
  mealId,
  focusReaction,
  onSaved,
  onLoggedElsewhere,
}: {
  form: LogFormDto;
  mealId: string;
  /** Opened from "Phản ứng" on S01: start at the reaction section. */
  focusReaction: boolean;
  /** Saved: the page keeps the confirmation even when the meal reloads as logged. */
  onSaved: (paused: { id: string; name: string }[]) => void;
  /** Another parent logged the meal first: show their log instead of this form. */
  onLoggedElsewhere: () => void;
}) {
  const child = useActiveChild();
  const queryClient = useQueryClient();
  const log = useLogMeal();
  const [draft, setDraft] = useState<Draft>(
    () => loadDraft<Draft>(draftKey(mealId)) ?? emptyDraft(form),
  );
  const sending = useRef(false);
  const saved = useRef(false);
  const noteId = useId();
  const timeId = useId();
  const reactionHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!focusReaction) return;
    reactionHeading.current?.scrollIntoView?.({ block: 'start' });
    reactionHeading.current?.focus();
  }, [focusReaction]);

  useEffect(() => {
    if (!saved.current) saveDraft(draftKey(mealId), draft);
  }, [draft, mealId]);

  const update = (changes: Partial<Draft>) => setDraft((d) => ({ ...d, ...changes }));
  const hasReaction = draft.symptoms.length > 0;
  const alarming =
    draft.symptoms.some((s) => ALARMING.has(s)) || (hasReaction && draft.severity === 'severe');
  const ready = draft.amount !== null && draft.liking !== null && draft.time !== '';
  const suspects = form.suspectIngredients.map((i) => i.name);
  const urgentLink = `/urgent?mealId=${mealId}`;

  async function save() {
    if (!ready || sending.current) return;
    sending.current = true;
    const result = await log
      .mutateAsync({
        mealId,
        data: {
          loggedAt: `${form.meal.date}T${draft.time}:00+07:00`,
          amount: draft.amount!,
          liking: draft.liking!,
          reaction: hasReaction
            ? { symptoms: draft.symptoms, severity: draft.severity, note: draft.note || null }
            : null,
        },
      })
      .catch((error: unknown) => {
        if (errorCode(error) === 'MEAL_ALREADY_LOGGED') {
          clearDraft(draftKey(mealId));
          onLoggedElsewhere();
        }
        return null;
      });
    sending.current = false;
    if (!result) return;
    saved.current = true;
    clearDraft(draftKey(mealId));
    onSaved(result.pausedIngredients);
    void invalidateChildData(queryClient, child.id);
    void queryClient.invalidateQueries({ queryKey: [`/api/v1/meals/${mealId}/log`] });
  }

  return (
    <>
      <div className={styles.stack}>
        <div className={styles.field}>
          <label htmlFor={timeId} className={styles.legend}>
            {t.time}
          </label>
          <input
            id={timeId}
            type="time"
            className={styles.time}
            value={draft.time}
            onChange={(e) => update({ time: e.target.value })}
          />
        </div>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>{t.amountLegend}</legend>
          <div className={styles.amounts}>
            {AMOUNTS.map((amount) => (
              <button
                key={amount}
                type="button"
                className={styles.choice}
                aria-pressed={draft.amount === amount}
                onClick={() => update({ amount })}
              >
                {t.amounts[amount]}
              </button>
            ))}
          </div>
        </fieldset>

        <RatingScale
          label={t.likingLabel}
          value={draft.liking}
          onChange={(liking) => update({ liking })}
          lowLabel={t.likingLow}
          highLabel={t.likingHigh}
        />

        <hr className={styles.divider} />

        <section aria-label={t.reactionLabel} className={styles.stack}>
          <div className={styles.headText}>
            <h2 ref={reactionHeading} tabIndex={-1} className={styles.sectionTitle}>
              {t.reactionTitle}
            </h2>
            <p className={styles.hint}>
              {form.firstTryIngredients.length > 0 && (
                <>
                  {t.firstTryIntro}{' '}
                  <strong>{firstTryNames(form.firstTryIngredients.map((i) => i.name))}</strong>
                  .{' '}
                </>
              )}
              {t.reactionHint}
            </p>
          </div>
          <div role="group" aria-label={t.symptomsLabel} className={styles.chips}>
            {SYMPTOMS.map((symptom) => (
              <ToggleChip
                key={symptom}
                tone="danger"
                pressed={draft.symptoms.includes(symptom)}
                onPressedChange={(on) =>
                  update({
                    symptoms: on
                      ? [...draft.symptoms, symptom]
                      : draft.symptoms.filter((s) => s !== symptom),
                  })
                }
              >
                {t.symptoms[symptom]}
              </ToggleChip>
            ))}
          </div>

          {hasReaction && (
            <>
              <fieldset className={styles.fieldset}>
                <legend className={styles.legend}>{t.severityLegend}</legend>
                <div className={styles.segmented}>
                  {SEVERITIES.map((severity) => (
                    <button
                      key={severity}
                      type="button"
                      className={`${styles.segment} ${severity === 'severe' ? styles.severe : ''}`}
                      aria-pressed={draft.severity === severity}
                      onClick={() => update({ severity })}
                    >
                      {t.severities[severity]}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className={styles.field}>
                <label htmlFor={noteId} className={styles.legend}>
                  {t.note}
                </label>
                <textarea
                  id={noteId}
                  rows={3}
                  maxLength={NOTE_MAX}
                  className={styles.note}
                  placeholder={t.notePlaceholder}
                  value={draft.note}
                  onChange={(e) => update({ note: e.target.value })}
                />
                <span className={styles.count} aria-live="polite">
                  {t.noteCount([...draft.note].length)}
                </span>
              </div>
              {alarming && (
                <AlertBox tone="danger">
                  {t.danger}{' '}
                  <Link to={urgentLink} className={styles.dangerLink}>
                    {t.dangerLink}
                  </Link>
                </AlertBox>
              )}
              <div className={styles.pauseBox}>
                {suspects.length > 0 ? (
                  <>
                    {t.willPauseBefore} <strong>{firstTryNames(suspects)}</strong>{' '}
                    {t.willPauseAfter}
                  </>
                ) : (
                  t.nothingToPause
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <div className={styles.footer}>
        {log.error != null && (
          <AlertBox tone="danger">
            {errorCode(log.error) === 'NETWORK_ERROR' ? t.notSaved : messageFor(log.error)}
          </AlertBox>
        )}
        {!ready && <p className={styles.hint}>{t.required}</p>}
        <button
          type="button"
          className={styles.save}
          onClick={save}
          disabled={!ready || log.isPending}
          aria-busy={log.isPending || undefined}
        >
          {log.isPending ? t.saving : t.save}
        </button>
        <Link to={urgentLink} className={styles.urgent}>
          <Icon name="pulse" size={16} />
          {t.urgent}
        </Link>
      </div>
    </>
  );
}

/** S07: what the child ate, how much they liked it, and anything unusual (UC-08/09). */
export function LogPage() {
  const { mealId } = useParams() as { mealId: string };
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const query = useGetMealLog(mealId);
  const form = query.data;
  const [saved, setSaved] = useState<{ id: string; name: string }[] | null>(null);
  const close = () => (location.key === 'default' ? navigate('/') : navigate(-1));

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <button type="button" aria-label={vi.common.close} className={styles.close} onClick={close}>
          <Icon name="close" />
        </button>
        {form && (
          <span className={styles.eyebrow}>
            {t.eyebrow(slotLabel(form.meal.slot as MealDtoSlot), form.meal.time)}
          </span>
        )}
      </div>
      <div className={styles.headText}>
        <h1 className={styles.title}>{t.title}</h1>
        {form && <div className={styles.dish}>{form.meal.dish.name}</div>}
      </div>
      {!form ? (
        query.isError ? (
          errorCode(query.error) === 'MEAL_NOT_FOUND' ? (
            <AlertBox tone="info">{messageFor(query.error)}</AlertBox>
          ) : (
            <LoadError error={query.error} retry={() => query.refetch()} />
          )
        ) : (
          <p role="status" className={styles.hint}>
            {vi.common.loading}
          </p>
        )
      ) : saved ? (
        <Saved paused={saved} />
      ) : form.log ? (
        <Summary log={form.log} />
      ) : (
        <LogForm
          form={form}
          mealId={mealId}
          focusReaction={params.get('reaction') === '1'}
          onSaved={setSaved}
          onLoggedElsewhere={() => void query.refetch()}
        />
      )}
    </div>
  );
}
