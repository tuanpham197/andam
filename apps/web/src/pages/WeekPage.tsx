import {
  useGenerateWeekPlan,
  useGetWeekPlan,
  type ChildDto,
  type WeekPlanDto,
} from '@appandam/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AlertBox } from '../components/AlertBox';
import { Button } from '../components/Button';
import { Disclaimer } from '../components/Disclaimer';
import { Icon } from '../components/Icon';
import { LoadError } from '../components/LoadError';
import { useActiveChild } from '../features/child/guards';
import {
  addDays,
  shortDate,
  todayInVietnam,
  weekRange,
  weekStartOf,
} from '../features/meals/format';
import { useNow } from '../features/meals/use-now';
import { errorCode, messageFor } from '../lib/errors';
import { vi } from '../strings/vi';
import styles from './WeekPage.module.css';

const t = vi.week;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function Stats({ stats, days }: { stats: WeekPlanDto['stats']; days: number }) {
  return (
    <div className={styles.stats}>
      <div className={styles.stat}>
        <span className={styles.statLabel}>{t.distinct}</span>
        <span className={styles.statValue}>
          {stats.distinctDishes}{' '}
          <span className={styles.statUnit}>{t.distinctValue(stats.totalMeals)}</span>
        </span>
      </div>
      <div className={styles.stat}>
        <span className={styles.statLabel}>{t.fullGroups}</span>
        <span className={styles.statValue}>
          {stats.daysFullGroups} <span className={styles.statUnit}>{t.fullGroupsValue(days)}</span>
        </span>
      </div>
    </div>
  );
}

function Rotation({ rotation }: { rotation: WeekPlanDto['stats']['proteinRotation'] }) {
  const max = Math.max(1, ...rotation.map((p) => p.meals));
  return (
    <section aria-label={t.rotation} className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>{t.rotation}</h2>
        <span className={styles.muted}>{t.rotationUnit}</span>
      </div>
      <ul className={styles.rotation}>
        {rotation.map(({ protein, meals, avoided }) => (
          <li key={protein} className={`${styles.rotationRow} ${avoided ? styles.avoided : ''}`}>
            <span>{vi.proteins[protein]}</span>
            {avoided ? (
              <span className={styles.avoidedNote}>{t.avoided}</span>
            ) : (
              <span className={styles.track} aria-hidden="true">
                <span className={styles.bar} style={{ width: `${(meals / max) * 100}%` }} />
              </span>
            )}
            <span className={styles.count}>{meals}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DayRow({ day, today }: { day: WeekPlanDto['days'][number]; today: string }) {
  const weekday = t.weekdays[new Date(`${day.date}T00:00:00Z`).getUTCDay()];
  const isToday = day.date === today;
  const firstTry = day.meals.flatMap((m) => m.newIngredients)[0];
  const names = day.meals.map((m) => m.dish.name).join(', ');
  let state = null;
  if (day.meals.length > 0)
    state =
      day.date > today ? (
        <span className={styles.state}>{t.planned}</span>
      ) : (
        <span
          className={day.groupsCovered === 4 ? styles.full : styles.partial}
          aria-label={t.groupsLabel(day.groupsCovered)}
        >
          {t.groups(day.groupsCovered)}
        </span>
      );
  return (
    <Link
      to={`/week/${day.date}`}
      className={`${styles.day} ${isToday ? styles.isToday : ''}`}
      aria-current={isToday ? 'date' : undefined}
    >
      <span className={styles.when}>
        <span className={styles.weekday}>{weekday}</span>
        {isToday ? t.today : shortDate(day.date)}
      </span>
      <span className={styles.summary}>
        {day.meals.length === 0 ? (
          <span className={styles.state}>{t.noPlan}</span>
        ) : (
          <>
            {names}
            {firstTry && (
              <span className={styles.new}>
                {' '}
                · {firstTry.name.toLocaleLowerCase('vi')} · {t.newFood}
              </span>
            )}
          </>
        )}
      </span>
      {state}
    </Link>
  );
}

/** G06 "Lên thực đơn tuần sau": asks before replacing a plan that already exists. */
function PlanNextWeek({ child, nextWeek }: { child: ChildDto; nextWeek: string }) {
  const [, setParams] = useSearchParams();
  const [confirming, setConfirming] = useState(false);
  const generate = useGenerateWeekPlan();
  const queryClient = useQueryClient();
  const open = () => setParams({ start: nextWeek });

  async function plan(overwrite: boolean) {
    const result = await generate
      .mutateAsync({ childId: child.id, weekStart: nextWeek, data: { overwrite } })
      .then(
        () => 'done' as const,
        (error: unknown) => (errorCode(error) === 'PLAN_EXISTS' ? 'exists' : 'failed'),
      );
    if (result === 'exists') return setConfirming(true);
    if (result === 'failed') return;
    setConfirming(false);
    await queryClient.invalidateQueries({
      predicate: (q) => String(q.queryKey[0]).startsWith(`/api/v1/children/${child.id}/`),
    });
    open();
  }

  return (
    <div className={styles.actions}>
      {generate.error != null && errorCode(generate.error) !== 'PLAN_EXISTS' && (
        <AlertBox tone="danger">{messageFor(generate.error)}</AlertBox>
      )}
      {confirming ? (
        <>
          <AlertBox tone="warn" title={t.replaceTitle}>
            {t.replaceBody}
          </AlertBox>
          <Button fullWidth loading={generate.isPending} onClick={() => plan(true)}>
            {t.replace}
          </Button>
          <Button
            fullWidth
            variant="secondary"
            onClick={() => {
              setConfirming(false);
              open();
            }}
          >
            {t.keep}
          </Button>
        </>
      ) : (
        <Button fullWidth loading={generate.isPending} onClick={() => plan(false)}>
          {t.planNext}
        </Button>
      )}
    </div>
  );
}

/** S04: the week at a glance, with indicators that help without judging (UC-12). */
export function WeekPage() {
  const child = useActiveChild();
  const today = todayInVietnam(useNow());
  const [params, setParams] = useSearchParams();
  const raw = params.get('start');
  const start = raw && DATE.test(raw) ? weekStartOf(raw) : weekStartOf(today);
  const week = useGetWeekPlan(child.id, start);
  const nextWeek = addDays(weekStartOf(today), 7);

  return (
    <>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>{t.eyebrow(child.name, weekRange(start))}</div>
          <h1 className={styles.title}>{t.title}</h1>
        </div>
        <div className={styles.arrows}>
          <button
            type="button"
            className={styles.arrow}
            aria-label={t.previous}
            onClick={() => setParams({ start: addDays(start, -7) })}
          >
            <Icon name="back" />
          </button>
          <button
            type="button"
            className={styles.arrow}
            aria-label={t.next}
            onClick={() => setParams({ start: addDays(start, 7) })}
          >
            <Icon name="chevronRight" />
          </button>
        </div>
      </div>

      {!child.plannable ? (
        <AlertBox tone="info">
          {child.notPlannableReason === 'too_old' ? vi.today.tooOld : vi.today.tooYoung}
        </AlertBox>
      ) : week.isPending ? (
        <p role="status" className={styles.muted}>
          {t.loading}
        </p>
      ) : week.isError ? (
        <LoadError error={week.error} retry={() => week.refetch()} />
      ) : (
        <>
          <Stats stats={week.data.stats} days={week.data.days.length} />
          <Rotation rotation={week.data.stats.proteinRotation} />
          <nav aria-label={t.daysLabel} className={styles.days}>
            {week.data.days.map((day) => (
              <DayRow key={day.date} day={day} today={today} />
            ))}
          </nav>
          <PlanNextWeek child={child} nextWeek={nextWeek} />
          <Disclaimer>{t.disclaimer}</Disclaimer>
        </>
      )}
    </>
  );
}
