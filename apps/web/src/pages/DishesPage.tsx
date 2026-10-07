import { useListDishes, type HiddenDishesDto, type ListDishesChip } from '@appandam/api-client';
import { keepPreviousData } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AlertBox } from '../components/AlertBox';
import { Icon } from '../components/Icon';
import { LoadError } from '../components/LoadError';
import { Switch } from '../components/Switch';
import { ToggleChip } from '../components/ToggleChip';
import { useActiveChild } from '../features/child/guards';
import { DishCard } from '../features/meals/DishCard';
import { exclusionParts } from '../features/meals/explain';
import { useDebouncedValue } from '../lib/use-debounced-value';
import { vi } from '../strings/vi';
import styles from './DishesPage.module.css';

const t = vi.library;
const CHIPS = Object.keys(t.chips) as ListDishesChip[];
const SEARCH_DELAY_MS = 150;

/** Filters live in the address, so a deep link or Back restores them (`?q=&chip=&fresh=`). */
function useFilters() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('chip') as ListDishesChip | null;
  const chip = raw && CHIPS.includes(raw) ? raw : 'all';
  const q = params.get('q') ?? '';
  const fresh = params.get('fresh') === '1' || params.get('fresh') === 'true';

  const update = (change: { q?: string; chip?: ListDishesChip; fresh?: boolean }) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        const set = (key: string, value: string | null) =>
          value ? next.set(key, value) : next.delete(key);
        if (change.q !== undefined) set('q', change.q.trim() || null);
        if (change.chip !== undefined) set('chip', change.chip === 'all' ? null : change.chip);
        if (change.fresh !== undefined) set('fresh', change.fresh ? '1' : null);
        return next;
      },
      { replace: true },
    );
  return { q, chip, fresh, update };
}

function SearchBox({ value, onSearch }: { value: string; onSearch: (q: string) => void }) {
  const id = useId();
  const [text, setText] = useState(value);
  const debounced = useDebouncedValue(text, SEARCH_DELAY_MS);
  useEffect(() => {
    if (debounced.trim() !== value) onSearch(debounced);
  }, [debounced, value, onSearch]);
  return (
    <div className={styles.search}>
      <Icon name="search" size={18} />
      <label htmlFor={id} className={styles.srOnly}>
        {t.searchLabel}
      </label>
      <input
        id={id}
        type="search"
        value={text}
        placeholder={t.searchPlaceholder}
        onChange={(e) => setText(e.target.value)}
        className={styles.input}
      />
    </div>
  );
}

function Hidden({
  hidden,
  query,
  allergens,
}: {
  hidden: HiddenDishesDto;
  query: string;
  allergens: string[];
}) {
  const [open, setOpen] = useState(false);
  if (hidden.total === 0) return null;
  return (
    <section aria-label={t.hiddenLabel} className={styles.hidden}>
      <span className={styles.hiddenTitle}>
        {query ? t.hiddenMatching(hidden.total) : t.hiddenTitle(hidden.total)}
      </span>
      <span className={styles.hiddenWhy}>
        {exclusionParts(hidden.byReason, allergens, 'món').join(' · ')}
      </span>
      <button
        type="button"
        className={styles.linkButton}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? t.hideHidden : t.showHidden}
      </button>
      {open && (
        <ul className={styles.hiddenList}>
          {hidden.items.map((item) => (
            <li key={item.dishId}>
              {item.name} — {t.hiddenReasons[item.reason]}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Library() {
  const child = useActiveChild();
  const { q, chip, fresh, update } = useFilters();
  const library = useListDishes(
    child.id,
    { q: q || undefined, chip: chip === 'all' ? undefined : chip, fresh: fresh || undefined },
    { query: { placeholderData: keepPreviousData } },
  );
  const allergens = child.avoidAllergens.map((a) => vi.allergens[a]);

  return (
    <>
      <SearchBox value={q} onSearch={(text) => update({ q: text })} />
      <div role="group" aria-label={t.chipsLabel} className={styles.chips}>
        {CHIPS.map((c) => (
          <ToggleChip key={c} pressed={c === chip} onPressedChange={() => update({ chip: c })}>
            {t.chips[c]}
          </ToggleChip>
        ))}
      </div>
      <div className={styles.countRow}>
        <span className={styles.count}>{library.data && t.count(library.data.dishes.length)}</span>
        <Switch
          label={t.fresh}
          checked={fresh}
          onCheckedChange={(checked) => update({ fresh: checked })}
        />
      </div>
      {library.isPending ? (
        <p role="status" className={styles.muted}>
          {vi.common.loading}
        </p>
      ) : library.isError ? (
        <LoadError error={library.error} retry={() => library.refetch()} />
      ) : (
        <>
          {library.data.dishes.length > 0 ? (
            <div className={styles.grid}>
              {library.data.dishes.map((dish) => (
                <DishCard key={dish.id} dish={dish} />
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              <p>{q ? t.emptyQuery(q) : t.empty}</p>
              {fresh && (
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => update({ fresh: false })}
                >
                  {t.dropFresh}
                </button>
              )}
            </div>
          )}
          <Hidden hidden={library.data.hidden} query={q} allergens={allergens} />
        </>
      )}
    </>
  );
}

/** S05: every dish the child may have, searchable and filtered by protein (UC-07). */
export function DishesPage() {
  const child = useActiveChild();
  const avoided = [
    ...child.avoidAllergens.map((a) => vi.allergens[a]),
    ...child.avoidIngredients.map((i) => i.name ?? i.ingredientId),
  ].map((name) => name.toLocaleLowerCase('vi'));

  return (
    <>
      <div className={styles.head}>
        <h1 className={styles.title}>{t.title}</h1>
        {child.effectiveStage && (
          <div className={styles.filtered}>
            {[
              t.filtered(child.name, child.effectiveStage),
              avoided.length > 0 && t.avoiding(avoided.join(', ')),
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        )}
      </div>
      {child.plannable ? (
        <Library />
      ) : (
        <div className={styles.notPlannable}>
          <AlertBox tone="info">
            {child.notPlannableReason === 'too_old' ? vi.today.tooOld : vi.today.tooYoung}
          </AlertBox>
          <Link to="/settings/age" className={styles.textLink}>
            {vi.today.checkAge}
          </Link>
        </div>
      )}
    </>
  );
}
