import { useGetDayPlan } from '@appandam/api-client';
import { useParams } from 'react-router';
import layout from '../app/layout.module.css';
import { AlertBox } from '../components/AlertBox';
import { LoadError } from '../components/LoadError';
import { ScreenHeader } from '../components/ScreenHeader';
import { useActiveChild } from '../features/child/guards';
import { DayMealList } from '../features/meals/DayMealList';
import { dayHeading, weekStartOf } from '../features/meals/format';
import { vi } from '../strings/vi';

const t = vi.dayDetail;

/** G09: any day of the week, with the meal list of S01; upcoming meals can be swapped (FR-095). */
export function DayDetailPage() {
  const child = useActiveChild();
  const { date } = useParams() as { date: string };
  const day = useGetDayPlan(child.id, date);

  return (
    <>
      <ScreenHeader title="" back={`/week?start=${weekStartOf(date)}`} />
      <h1 className={layout.title}>{dayHeading(date)}</h1>
      {day.isPending ? (
        <p role="status" className={layout.intro}>
          {vi.common.loading}
        </p>
      ) : day.isError ? (
        <LoadError error={day.error} retry={() => day.refetch()} />
      ) : day.data.meals.length === 0 && day.data.unfilledSlots.length === 0 ? (
        <AlertBox tone="info">{t.empty}</AlertBox>
      ) : (
        <DayMealList day={day.data} title={t.title} label={t.listLabel} />
      )}
    </>
  );
}
