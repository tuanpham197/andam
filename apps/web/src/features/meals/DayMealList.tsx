import type { DayPlanDto, MealDto, MealDtoSlot } from '@appandam/api-client';
import { Disclaimer } from '../../components/Disclaimer';
import styles from '../../pages/TodayPage.module.css';
import { vi } from '../../strings/vi';
import { daySummary, isSnackSlot } from './format';
import { MealRow, type MealRowState } from './MealRow';

const t = vi.today;

interface Row {
  time: string;
  slot: MealDtoSlot;
  meal?: MealDto;
}

function rowFor(meal: MealDto, nextMealId: string | null): { note: string; state: MealRowState } {
  if (meal.id === nextMealId) return { note: t.status.next, state: 'next' };
  if (meal.status === 'eaten') return { note: t.status.eaten, state: 'eaten' };
  if (meal.status === 'refused' || meal.status === 'skipped')
    return { note: t.status[meal.status], state: 'closed' };
  if (meal.status === 'prepared') return { note: t.status.prepared, state: 'pending' };
  const minutes = vi.minutes(meal.dish.prepMin + meal.dish.cookMin);
  const protein = meal.dish.mainProtein;
  const lead = isSnackSlot(meal.slot)
    ? t.snack
    : protein && `${vi.foodGroups.protein} · ${vi.proteins[protein]}`;
  return { note: [lead, minutes].filter(Boolean).join(' · '), state: 'pending' };
}

/** The meals of one day in time order, slots without a safe dish included (S01, G09). */
export function DayMealList({
  day,
  title,
  label,
}: {
  day: DayPlanDto;
  title: string;
  label: string;
}) {
  const rows: Row[] = [
    ...day.meals.map((meal) => ({ time: meal.time, slot: meal.slot, meal })),
    ...day.unfilledSlots,
  ].sort((a, b) => a.time.localeCompare(b.time));

  return (
    <section aria-label={label} className={styles.stack}>
      <div className={styles.listHead}>
        <h2 className={styles.listTitle}>{title}</h2>
        <span className={styles.muted}>{daySummary(rows.map((r) => r.slot))}</span>
      </div>
      <div className={styles.list}>
        {rows.map(({ time, slot, meal }) =>
          meal ? (
            <MealRow
              key={slot}
              time={time}
              slot={slot}
              name={meal.dish.name}
              to={`/dishes/${meal.dish.id}?meal=${meal.id}`}
              {...rowFor(meal, day.nextMealId)}
            />
          ) : (
            <MealRow key={slot} time={time} slot={slot} name={t.unfilled} note="" state="empty" />
          ),
        )}
      </div>
      <Disclaimer>{t.disclaimer}</Disclaimer>
    </section>
  );
}
