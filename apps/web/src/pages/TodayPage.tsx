import {
  useGetChildHealth,
  useGetDayPlan,
  useListStages,
  type ChildDto,
} from '@appandam/api-client';
import { Link } from 'react-router';
import { AlertBox } from '../components/AlertBox';
import { Chip } from '../components/Chip';
import { Icon } from '../components/Icon';
import { LoadError } from '../components/LoadError';
import { formatAge, textureLabel } from '../features/child/format';
import { ChildSwitcher } from '../features/child/ChildSwitcher';
import { useActiveChild } from '../features/child/guards';
import { DayMealList } from '../features/meals/DayMealList';
import { avoidSummary, dayHeading, shortDate, todayInVietnam } from '../features/meals/format';
import { NextMealCard } from '../features/meals/NextMealCard';
import { useNow } from '../features/meals/use-now';
import { usePrepareMeal } from '../features/meals/use-prepare-meal';
import { vi } from '../strings/vi';
import styles from './TodayPage.module.css';

const t = vi.today;

function Header({ child, date }: { child: ChildDto; date: string }) {
  const stage = useListStages().data?.find((s) => s.id === child.effectiveStage);
  const health = useGetChildHealth(child.id).data;
  const avoided = [
    ...child.avoidAllergens.map((a) => vi.allergens[a]),
    ...child.avoidIngredients.map((i) => i.name ?? i.ingredientId),
  ];
  const summary = [formatAge(child.age), child.effectiveStage && t.stage(child.effectiveStage)]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={styles.header}>
      <div className={styles.identity}>
        <div className={styles.avatar} aria-hidden="true">
          {child.initials}
        </div>
        <div className={styles.who}>
          <div className={styles.date}>{dayHeading(date)}</div>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{t.childName(child.name)}</h1>
            <ChildSwitcher />
          </div>
          <div className={styles.summary}>{summary}</div>
        </div>
      </div>
      {child.plannable && (
        <div className={styles.chips}>
          {stage && <Chip to="/settings/age">{t.texture(textureLabel(stage.texture))}</Chip>}
          <Chip tone="primary" to="/health">
            <Icon name="pulse" size={14} />
            {t.health(vi.healthStatus[health?.status ?? 'normal'])}
          </Chip>
          {avoided.length > 0 && <Chip tone="danger">{t.avoid(avoidSummary(avoided))}</Chip>}
        </div>
      )}
    </div>
  );
}

/** BR-53: past the expected end, the parent is nudged to update the status (TC-HLT-009). */
function HealthOverdue({ child }: { child: ChildDto }) {
  const health = useGetChildHealth(child.id).data;
  if (!health?.overdue || !health.expectedEndDate) return null;
  return (
    <AlertBox tone="warn">
      <span>{t.healthOverdue(shortDate(health.expectedEndDate))}</span>{' '}
      <Link to="/health" className={styles.inlineLink}>
        {t.updateHealth}
      </Link>
    </AlertBox>
  );
}

function NotPlannable({ reason }: { reason: ChildDto['notPlannableReason'] }) {
  return (
    <div className={styles.stack}>
      <AlertBox tone="info">{reason === 'too_old' ? t.tooOld : t.tooYoung}</AlertBox>
      <Link to="/settings/age" className={styles.textLink}>
        {t.checkAge}
      </Link>
    </div>
  );
}

function DayPlan({ child, date, now }: { child: ChildDto; date: string; now: Date }) {
  // FR-120: another member's log or swap shows up within a minute (and on returning to the tab).
  const day = useGetDayPlan(child.id, date, { query: { refetchInterval: 60_000 } });
  const preparing = usePrepareMeal(child.id, date);

  if (day.isPending)
    return (
      <p role="status" className={styles.muted}>
        {t.loading}
      </p>
    );
  if (day.isError) return <LoadError error={day.error} retry={() => day.refetch()} />;
  if (!day.data.plannable) return <NotPlannable reason={child.notPlannableReason} />;

  const { meals, nextMealId, unfilledSlots } = day.data;
  const next = meals.find((m) => m.id === nextMealId);
  return (
    <>
      {unfilledSlots.length > 0 && (
        <AlertBox tone="warn">
          <span>{t.unfilledAlert}</span>{' '}
          <Link to="/profile" className={styles.inlineLink}>
            {t.reviewAvoid}
          </Link>
        </AlertBox>
      )}
      {next ? (
        <NextMealCard
          meal={next}
          date={date}
          now={now}
          onPrepare={() => preparing.prepare(next.id)}
          preparing={preparing.isPending}
          error={preparing.error}
        />
      ) : (
        meals.length > 0 && (
          <section className={styles.done}>
            <h2 className={styles.listTitle}>{t.doneTitle}</h2>
            <p className={styles.muted}>{t.doneBody}</p>
          </section>
        )
      )}
      <DayMealList day={day.data} title={t.listTitle} label={t.listLabel} />
    </>
  );
}

/** S01: the next meal first, then the rest of the day (UC-04). */
export function TodayPage() {
  const child = useActiveChild();
  const now = useNow();
  const date = todayInVietnam(now);
  return (
    <>
      <Header child={child} date={date} />
      <HealthOverdue child={child} />
      {child.plannable ? (
        <DayPlan child={child} date={date} now={now} />
      ) : (
        <NotPlannable reason={child.notPlannableReason} />
      )}
    </>
  );
}
