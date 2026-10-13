import { useGetFoodProgress, type FoodItemDto, type FoodProgressDto } from '@appandam/api-client';
import { Link } from 'react-router';
import layout from '../app/layout.module.css';
import { Disclaimer } from '../components/Disclaimer';
import { LoadError } from '../components/LoadError';
import { ScreenHeader } from '../components/ScreenHeader';
import { useActiveChild } from '../features/child/guards';
import { dayHeading } from '../features/meals/format';
import { vi } from '../strings/vi';
import styles from './FoodsPage.module.css';

const t = vi.foods;
type Group = 'protein' | 'veg' | 'fruit';

function statusText(item: FoodItemDto): string {
  return item.status === 'not_yet'
    ? t.status.not_yet(item.minAgeMonths)
    : t.status[item.status as Exclude<FoodItemDto['status'], 'not_yet'>];
}

function FoodRow({ item }: { item: FoodItemDto }) {
  return (
    <li className={styles.row}>
      <span>{item.name}</span>
      <span className={`${styles.tag} ${styles[item.status] ?? ''}`}>{statusText(item)}</span>
    </li>
  );
}

/** G16: the foods the child has tried, is avoiding and will try next (UC-26, FR-145/146). */
export function FoodsPage() {
  const child = useActiveChild();
  const query = useGetFoodProgress(child.id);

  return (
    <>
      <ScreenHeader title="" back="/profile" />
      <h1 className={layout.title}>{t.title(child.name)}</h1>
      <p className={layout.intro}>{t.intro}</p>
      {query.isPending ? (
        <p role="status" className={styles.muted}>
          {t.loading}
        </p>
      ) : query.isError ? (
        <LoadError error={query.error} retry={() => query.refetch()} />
      ) : (
        <FoodsView data={query.data} />
      )}
    </>
  );
}

function FoodsView({ data }: { data: FoodProgressDto }) {
  const { summary } = data;
  const share = summary.total === 0 ? 0 : Math.round((summary.tried / summary.total) * 100);
  const others = [
    summary.paused > 0 && t.others.paused(summary.paused),
    summary.avoided > 0 && t.others.avoided(summary.avoided),
    summary.notYet > 0 && t.others.notYet(summary.notYet),
  ].filter(Boolean);
  const upcoming = data.groups
    .flatMap((g) => g.items)
    .filter((i) => i.upcomingOn !== null)
    .sort(
      (a, b) => a.upcomingOn!.localeCompare(b.upcomingOn!) || a.name.localeCompare(b.name, 'vi'),
    );

  return (
    <>
      <section aria-label={t.progressLabel} className={styles.card}>
        <span className={styles.progressValue}>{t.progress(summary.tried, summary.total)}</span>
        <span
          className={styles.track}
          role="progressbar"
          aria-label={t.progressLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={share}
        >
          <span className={styles.bar} style={{ width: `${share}%` }} />
        </span>
        {others.length > 0 && <p className={styles.muted}>{others.join(' · ')}</p>}
      </section>

      <section aria-label={t.upcoming} className={styles.card}>
        <h2 className={styles.sectionTitle}>{t.upcoming}</h2>
        {upcoming.length === 0 ? (
          <p className={styles.muted}>{t.upcomingNone}</p>
        ) : (
          <ul className={styles.list}>
            {upcoming.map((item) => (
              <li key={item.id} className={styles.row}>
                <Link to={`/week/${item.upcomingOn}`} className={styles.rowLink}>
                  <span>{item.name}</span>
                  <span className={styles.muted}>{t.upcomingOn(dayHeading(item.upcomingOn!))}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.groups.map((group) => (
        <section
          key={group.group}
          aria-label={vi.foodGroups[group.group as Group]}
          className={styles.card}
        >
          <h2 className={styles.sectionTitle}>{vi.foodGroups[group.group as Group]}</h2>
          <ul className={styles.list}>
            {group.items.map((item) => (
              <FoodRow key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ))}
      {summary.paused > 0 && (
        <p className={styles.muted}>
          <Link to="/profile">{t.pausedHint}</Link>
        </p>
      )}
      <Disclaimer>{t.advice}</Disclaimer>
    </>
  );
}
