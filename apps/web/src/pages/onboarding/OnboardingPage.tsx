import { getListChildrenQueryKey, useCreateChild } from '@appandam/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import styles from '../../app/layout.module.css';
import { AlertBox } from '../../components/AlertBox';
import { Button } from '../../components/Button';
import { Disclaimer } from '../../components/Disclaimer';
import { RadioCard } from '../../components/RadioCard';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Stepper } from '../../components/Stepper';
import { Switch } from '../../components/Switch';
import { TextField } from '../../components/TextField';
import { AvoidFoodsEditor } from '../../features/child/AvoidFoodsEditor';
import {
  clearDraft,
  useOnboardingDraft,
  type OnboardingDraft,
} from '../../features/onboarding/draft';
import { errorCode, messageFor } from '../../lib/errors';
import { vi } from '../../strings/vi';

const TOTAL = 5;
const t = vi.onboarding;

/** Which step lets the parent fix a field the API rejected. */
const STEP_FOR_ERROR: Record<string, number> = {
  INVALID_CHILD_NAME: 1,
  INVALID_BIRTH_DATE: 2,
  CHILD_TOO_OLD: 2,
  INVALID_WEEKS_EARLY: 2,
  UNKNOWN_INGREDIENT: 3,
  TOO_MANY_AVOID_ITEMS: 3,
  INVALID_PRIOR_REACTION_NOTE: 4,
};

const graphemeCount = (value: string) =>
  [...new Intl.Segmenter('vi', { granularity: 'grapheme' }).segment(value.trim())].length;

const todayLocal = () => new Date().toLocaleDateString('en-CA');

const formatDate = (date: string) => date.split('-').reverse().join('/');

function Form({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
      <Button type="submit" fullWidth>
        {vi.onboarding.next}
      </Button>
    </form>
  );
}

function NameStep({ draft, update, go }: StepProps) {
  const [error, setError] = useState<string>();
  return (
    <Form
      onSubmit={() => {
        const length = graphemeCount(draft.name);
        if (length === 0) return setError(t.nameRequired);
        if (length > 30) return setError(t.nameTooLong);
        go(2);
      }}
    >
      <h1 className={styles.title}>{t.nameTitle}</h1>
      <TextField
        label={t.nameLabel}
        autoComplete="off"
        value={draft.name}
        onChange={(e) => update({ name: e.target.value })}
        error={error}
      />
    </Form>
  );
}

function BirthStep({ draft, update, go }: StepProps) {
  const [dateError, setDateError] = useState<string>();
  const [weeksError, setWeeksError] = useState<string>();
  return (
    <Form
      onSubmit={() => {
        const date = !draft.birthDate
          ? t.birthRequired
          : draft.birthDate > todayLocal()
            ? t.birthFuture
            : undefined;
        const weeks =
          draft.isPremature &&
          !(Number.isInteger(draft.weeksEarly) && draft.weeksEarly >= 1 && draft.weeksEarly <= 16)
            ? t.weeksRange
            : undefined;
        setDateError(date);
        setWeeksError(weeks);
        if (!date && !weeks) go(3);
      }}
    >
      <h1 className={styles.title}>{t.birthTitle(draft.name.trim())}</h1>
      <TextField
        label={t.birthLabel}
        type="date"
        max={todayLocal()}
        value={draft.birthDate}
        onChange={(e) => update({ birthDate: e.target.value })}
        error={dateError}
      />
      <Switch
        label={t.premature}
        description={
          <span style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            {t.prematureHint}
          </span>
        }
        checked={draft.isPremature}
        onCheckedChange={(isPremature) => update({ isPremature })}
      />
      {draft.isPremature && (
        <TextField
          label={t.weeksLabel}
          type="number"
          inputMode="numeric"
          min={1}
          max={16}
          value={Number.isNaN(draft.weeksEarly) ? '' : String(draft.weeksEarly)}
          onChange={(e) => update({ weeksEarly: e.target.valueAsNumber })}
          error={weeksError}
        />
      )}
    </Form>
  );
}

function AvoidStep({ draft, update, go }: StepProps) {
  return (
    <Form onSubmit={() => go(draft.priorReaction === 'yes' ? 4 : 5)}>
      <h1 className={styles.title}>{t.avoidTitle(draft.name.trim())}</h1>
      <p className={styles.intro}>{t.avoidIntro}</p>
      <AvoidFoodsEditor
        allergens={draft.avoidAllergens}
        ingredients={draft.avoidIngredients}
        onAllergensChange={(avoidAllergens) => update({ avoidAllergens })}
        onIngredientsChange={(avoidIngredients) => update({ avoidIngredients })}
      />
      <fieldset className={styles.form} style={{ border: 'none', margin: 0, padding: 0 }}>
        <legend style={{ fontWeight: 700, padding: 0, marginBottom: 10 }}>
          {t.reactionLegend}
        </legend>
        {(['never', 'yes', 'unsure'] as const).map((value) => (
          <RadioCard
            key={value}
            name="priorReaction"
            value={value}
            title={t.reactions[value]}
            checked={draft.priorReaction === value}
            onChange={(priorReaction) => update({ priorReaction })}
          />
        ))}
      </fieldset>
      <Disclaimer>{t.doctorNote}</Disclaimer>
    </Form>
  );
}

function ReactionStep({ draft, update, go }: StepProps) {
  return (
    <Form onSubmit={() => go(5)}>
      <h1 className={styles.title}>{t.reactionTitle}</h1>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontWeight: 600 }}>
        {t.reactionNoteLabel}
        <textarea
          rows={5}
          maxLength={500}
          value={draft.priorReactionNote}
          onChange={(e) => update({ priorReactionNote: e.target.value })}
          placeholder={t.reactionNotePlaceholder}
          style={{
            padding: 12,
            borderRadius: 12,
            border: '1px solid var(--border-strong)',
            background: 'var(--surface)',
            fontWeight: 400,
          }}
        />
      </label>
    </Form>
  );
}

function SummaryStep({ draft }: StepProps) {
  const create = useCreateChild();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fixStep = STEP_FOR_ERROR[errorCode(create.error) ?? ''];

  async function submit() {
    const created = await create
      .mutateAsync({
        data: {
          name: draft.name,
          birthDate: draft.birthDate,
          isPremature: draft.isPremature,
          weeksEarly: draft.isPremature ? draft.weeksEarly : 0,
          priorReaction: draft.priorReaction,
          priorReactionNote:
            draft.priorReaction === 'yes' ? draft.priorReactionNote.trim() || null : null,
          avoidAllergens: draft.avoidAllergens,
          avoidIngredients: draft.avoidIngredients.map(({ ingredientId, reason }) => ({
            ingredientId,
            reason,
          })),
        },
      })
      .catch(() => null);
    if (!created) return;
    clearDraft();
    await queryClient.invalidateQueries({ queryKey: getListChildrenQueryKey() });
    await navigate('/', { replace: true });
  }

  const avoided = [
    ...draft.avoidAllergens.map((a) => vi.allergens[a]),
    ...draft.avoidIngredients.map((i) => i.name),
  ];

  return (
    <>
      <h1 className={styles.title}>{t.summaryTitle}</h1>
      {create.error && (
        <AlertBox tone="danger">
          {messageFor(create.error)} {fixStep && <Link to={`/onboarding/${fixStep}`}>{t.fix}</Link>}
        </AlertBox>
      )}
      <dl className={styles.card} style={{ margin: 0, display: 'grid', gap: 10 }}>
        <SummaryRow label={t.nameLabel}>{draft.name.trim()}</SummaryRow>
        <SummaryRow label={t.birthLabel}>{formatDate(draft.birthDate)}</SummaryRow>
        {draft.isPremature && (
          <SummaryRow label={t.premature}>{t.weeksEarly(draft.weeksEarly)}</SummaryRow>
        )}
        <SummaryRow label={t.avoidSummary}>
          {avoided.length > 0
            ? avoided.map((name) => (
                <span key={name} style={{ display: 'block' }}>
                  {name}
                </span>
              ))
            : t.none}
        </SummaryRow>
        <SummaryRow label={t.reactionLegend}>{t.reactions[draft.priorReaction]}</SummaryRow>
      </dl>
      <Button fullWidth loading={create.isPending} onClick={submit}>
        {t.create}
      </Button>
      <Disclaimer>{t.doctorNote}</Disclaimer>
    </>
  );
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{label}</dt>
      <dd style={{ margin: 0, fontWeight: 600 }}>{children}</dd>
    </div>
  );
}

interface StepProps {
  draft: OnboardingDraft;
  update: (changes: Partial<OnboardingDraft>) => void;
  go: (step: number) => void;
}

const STEPS = [NameStep, BirthStep, AvoidStep, ReactionStep, SummaryStep];

export function OnboardingPage() {
  const { step: param } = useParams();
  const step = Number(param);
  const { draft, update } = useOnboardingDraft();
  const navigate = useNavigate();

  if (!Number.isInteger(step) || step < 1 || step > TOTAL)
    return <Navigate to="/onboarding/1" replace />;
  // Later steps need the earlier answers (deep link, cleared storage).
  if (step > 1 && (!draft.name.trim() || (step > 2 && !draft.birthDate))) {
    return <Navigate to="/onboarding/1" replace />;
  }

  const Step = STEPS[step - 1]!;
  const back = step === 5 && draft.priorReaction !== 'yes' ? 3 : step - 1;
  return (
    <>
      <ScreenHeader
        title={t.title}
        back={step > 1 ? `/onboarding/${back}` : undefined}
        trailing={<Stepper current={step} total={TOTAL} />}
      />
      <Step draft={draft} update={update} go={(n) => void navigate(`/onboarding/${n}`)} />
    </>
  );
}
