import { getJournal, type JournalEntryDto } from '@appandam/api-client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { Icon } from '../components/Icon';
import { LoadError } from '../components/LoadError';
import { useActiveChild } from '../features/child/guards';
import {
  dayHeading,
  firstTryNames,
  slotLabel,
  timeInVietnam,
  todayInVietnam,
} from '../features/meals/format';
import { vi } from '../strings/vi';
import styles from './JournalPage.module.css';

const t = vi.journal;
type Amount = keyof typeof vi.log.amounts;
type Symptom = keyof typeof vi.log.symptoms;
type Severity = keyof typeof vi.log.severities;
type Slot = Parameters<typeof slotLabel>[0];

/** The day an entry happened, in Vietnam. */
const dayOf = (entry: JournalEntryDto) => todayInVietnam(new Date(entry.at));

function heading(day: string, today: string): string {
  if (day === today) return t.today;
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return day === yesterday.toISOString().slice(0, 10) ? t.yesterday : dayHeading(day);
}

function MealEntry({ entry }: { entry: JournalEntryDto }) {
  const reaction = entry.reaction;
  return (
    <li className={`${styles.entry} ${reaction ? styles.reaction : ''}`}>
      <span className={styles.time}>{timeInVietnam(entry.at)}</span>
      <div className={styles.text}>
        <span className={styles.meta}>{slotLabel(entry.slot as Slot)}</span>
        <Link to={`/dishes/${entry.dish!.id}`} className={styles.name}>
          {entry.dish!.name}
        </Link>
        <span className={styles.meta}>
          {[
            vi.log.amounts[entry.amount as Amount],
            t.liking(entry.liking!),
            t.by(entry.actorName ?? vi.log.deletedUser),
          ].join(' · ')}
        </span>
        {reaction && (
          <span className={styles.danger}>
            {[
              ...reaction.symptoms.map((s) => vi.log.symptoms[s as Symptom]),
              vi.log.severities[reaction.severity as Severity],
            ].join(' · ')}
          </span>
        )}
        {reaction?.note && <span className={styles.note}>{reaction.note}</span>}
        {entry.pausedIngredients.length > 0 && (
          <span className={styles.paused}>
            {t.paused(firstTryNames(entry.pausedIngredients.map((p) => p.name)))}
          </span>
        )}
      </div>
    </li>
  );
}

function UrgentEntry({ entry }: { entry: JournalEntryDto }) {
  return (
    <li className={`${styles.entry} ${styles.urgent}`}>
      <span className={styles.time}>{timeInVietnam(entry.at)}</span>
      <div className={styles.text}>
        <span className={styles.urgentTitle}>
          <Icon name="pulse" size={16} />
          {t.urgent}
        </span>
        {entry.dish && (
          <span className={styles.meta}>
            {slotLabel(entry.slot as Slot)} · {entry.dish.name}
          </span>
        )}
        <span className={styles.meta}>{t.by(entry.actorName ?? vi.log.deletedUser)}</span>
        {entry.contactedMedicalAt && (
          <span className={styles.meta}>
            {t.contacted(timeInVietnam(entry.contactedMedicalAt))}
          </span>
        )}
        {entry.pausedIngredients.length > 0 && (
          <span className={styles.paused}>
            {t.paused(firstTryNames(entry.pausedIngredients.map((p) => p.name)))}
          </span>
        )}
      </div>
    </li>
  );
}

/** G02: meals, reactions and urgent events, newest first, loaded page by page (FR-069). */
export function JournalPage() {
  const child = useActiveChild();
  const journal = useInfiniteQuery({
    queryKey: [`/api/v1/children/${child.id}/journal`, 'pages'],
    queryFn: ({ pageParam }) => getJournal(child.id, pageParam ? { cursor: pageParam } : undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = journal;

  // Loads the next page as the end of the list comes into view.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((items) => {
      if (items.some((i) => i.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const entries = journal.data?.pages.flatMap((p) => p.entries) ?? [];
  const today = todayInVietnam(new Date());
  const days = [...new Set(entries.map(dayOf))];

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t.title}</h1>
      {journal.isPending ? (
        <p role="status" className={styles.muted}>
          {vi.common.loading}
        </p>
      ) : journal.isError && entries.length === 0 ? (
        <LoadError error={journal.error} retry={() => journal.refetch()} />
      ) : entries.length === 0 ? (
        <p className={styles.muted}>{t.empty}</p>
      ) : (
        <>
          {days.map((day) => (
            <section key={day} aria-label={heading(day, today)} className={styles.day}>
              <h2 className={styles.dayTitle}>{heading(day, today)}</h2>
              <ul className={styles.list}>
                {entries
                  .filter((e) => dayOf(e) === day)
                  .map((entry) =>
                    entry.kind === 'meal' ? (
                      <MealEntry key={entry.id} entry={entry} />
                    ) : (
                      <UrgentEntry key={entry.id} entry={entry} />
                    ),
                  )}
              </ul>
            </section>
          ))}
          {journal.isFetchNextPageError && (
            <LoadError error={journal.error} retry={() => journal.fetchNextPage()} />
          )}
          <div ref={sentinel} />
          {hasNextPage && (
            <button
              type="button"
              className={styles.more}
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? vi.common.loading : t.more}
            </button>
          )}
        </>
      )}
    </div>
  );
}
