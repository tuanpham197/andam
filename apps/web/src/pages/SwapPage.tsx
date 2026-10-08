import {
  useGetSwapSuggestions,
  useSwapMeal,
  type SwapCandidateDto,
  type SwapSuggestionsDto,
  type SwapDtoReason,
} from '@appandam/api-client';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { AlertBox } from '../components/AlertBox';
import { Icon } from '../components/Icon';
import { LoadError } from '../components/LoadError';
import { ToggleChip } from '../components/ToggleChip';
import { textureLabel } from '../features/child/format';
import { useActiveChild } from '../features/child/guards';
import { invalidateChildData } from '../features/child/invalidate';
import { exclusionParts, proteinTag, reasonText, repeatNote } from '../features/meals/explain';
import { isSnackSlot, slotLabel } from '../features/meals/format';
import { errorCode, messageFor } from '../lib/errors';
import { vi } from '../strings/vi';
import styles from './SwapPage.module.css';

const t = vi.swap;
const REASONS = Object.keys(t.reasons) as SwapDtoReason[];
/** The meal cannot be swapped at all: retrying will not help. */
const FINAL = new Set([
  'MEAL_ALREADY_LOGGED',
  'MEAL_NOT_FOUND',
  'MEAL_IN_PAST',
  'CHILD_NOT_PLANNABLE',
]);

const minutes = (c: SwapCandidateDto) => vi.minutes(c.dish.prepMin + c.dish.cookMin);

function BestCard({
  candidate,
  data,
  onChoose,
  busy,
}: {
  candidate: SwapCandidateDto;
  data: SwapSuggestionsDto;
  onChoose: () => void;
  busy: boolean;
}) {
  const { dish } = candidate;
  return (
    <article aria-label={dish.name} className={`${styles.card} ${styles.best}`}>
      <div className={styles.cardHead}>
        <div className={styles.cardText}>
          <span className={styles.name}>{dish.name}</span>
          <span className={styles.meta}>
            {[minutes(candidate), textureLabel(candidate.texture), candidate.portionText].join(
              ' · ',
            )}
          </span>
        </div>
        <span className={styles.badge}>{t.best}</span>
      </div>
      <ul className={styles.reasons}>
        {candidate.reasons.map((code) => (
          <li key={code}>
            <Icon name="check" size={14} />
            {reasonText(code, {
              protein: dish.mainProtein,
              otherMains: data.otherMains,
              fasterByMin: candidate.fasterByMin,
            })}
          </li>
        ))}
      </ul>
      <RepeatNote candidate={candidate} />
      <button type="button" className={styles.primary} onClick={onChoose} disabled={busy}>
        {t.chooseBest}
      </button>
    </article>
  );
}

function RepeatNote({ candidate }: { candidate: SwapCandidateDto }) {
  const note = repeatNote(candidate.repeatInDays);
  return note && <p className={styles.note}>{note}</p>;
}

function OtherCard({
  candidate,
  snack,
  onChoose,
  busy,
}: {
  candidate: SwapCandidateDto;
  snack: boolean;
  onChoose: () => void;
  busy: boolean;
}) {
  const { dish } = candidate;
  const meta = [
    minutes(candidate),
    proteinTag(snack ? 'snack' : 'main', dish.mainProtein),
    candidate.fasterByMin > 0 && t.fasterBy(candidate.fasterByMin),
  ].filter(Boolean);
  return (
    <article aria-label={dish.name} className={styles.card}>
      <div className={styles.cardHead}>
        <div className={styles.cardText}>
          <span className={styles.name}>{dish.name}</span>
          <span className={styles.meta}>{meta.join(' · ')}</span>
        </div>
        <button
          type="button"
          className={styles.secondary}
          onClick={onChoose}
          disabled={busy}
          aria-label={t.chooseLabel(dish.name)}
        >
          {t.choose}
        </button>
      </div>
      <RepeatNote candidate={candidate} />
    </article>
  );
}

/** S02: replacements for one meal, ranked for the reason the parent gives (UC-06). */
export function SwapPage() {
  const child = useActiveChild();
  const { mealId } = useParams() as { mealId: string };
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<SwapDtoReason>('missing_ingredient');
  const query = useGetSwapSuggestions(
    mealId,
    { reason },
    { query: { placeholderData: keepPreviousData } },
  );
  const swap = useSwapMeal();
  const busy = useRef(false);

  // After a deep link there is no screen to go back to.
  const close = () => (location.key === 'default' ? navigate('/') : navigate(-1));

  async function choose(dishId: string) {
    if (busy.current) return;
    busy.current = true;
    // BR-77: the dish the parent was looking at; changed by another member meanwhile → refused.
    const expectedDishId = query.data?.meal.dish.id;
    const done = await swap.mutateAsync({ mealId, data: { dishId, reason, expectedDishId } }).then(
      () => true,
      () => false,
    );
    busy.current = false;
    if (!done) {
      // The dish may have become unsafe, or the meal been logged: show the current state.
      void query.refetch();
      return;
    }
    void invalidateChildData(queryClient, child.id);
    void close();
  }

  const data = query.data;
  const finalError = query.error && FINAL.has(errorCode(query.error) ?? '') ? query.error : null;

  return (
    <div className={styles.sheet}>
      <div className={styles.head}>
        <div className={styles.headText}>
          {data && (
            <div className={styles.eyebrow}>
              {t.eyebrow(slotLabel(data.meal.slot).toLocaleLowerCase('vi'), data.meal.time)}
            </div>
          )}
          <h1 className={styles.title}>{t.title}</h1>
          {data && <div className={styles.replacing}>{t.replacing(data.meal.dish.name)}</div>}
        </div>
        <button type="button" aria-label={vi.common.close} className={styles.close} onClick={close}>
          <Icon name="close" />
        </button>
      </div>

      {finalError ? (
        <div className={styles.stack}>
          <AlertBox tone="info">{messageFor(finalError)}</AlertBox>
          <Link to="/" className={styles.textLink}>
            {t.home}
          </Link>
        </div>
      ) : !data ? (
        query.isError ? (
          <LoadError error={query.error} retry={() => query.refetch()} />
        ) : (
          <p role="status" className={styles.muted}>
            {vi.common.loading}
          </p>
        )
      ) : (
        <>
          <fieldset className={styles.reasonSet}>
            <legend className={styles.legend}>{t.reasonLegend}</legend>
            <div className={styles.chips}>
              {REASONS.map((r) => (
                <ToggleChip key={r} pressed={r === reason} onPressedChange={() => setReason(r)}>
                  {t.reasons[r]}
                </ToggleChip>
              ))}
            </div>
          </fieldset>

          <section aria-label={t.suggestions} className={styles.stack}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>{t.suggestions}</h2>
              {query.isPlaceholderData && (
                <span role="status" className={styles.muted}>
                  {t.updating}
                </span>
              )}
            </div>
            {swap.error != null && <AlertBox tone="danger">{messageFor(swap.error)}</AlertBox>}
            {data.ranked.length === 0 ? (
              <div className={styles.empty}>
                <p className={styles.muted}>{reason === 'faster' ? t.noFaster : t.none}</p>
                <Link to="/dishes" className={styles.textLink}>
                  {t.openLibrary}
                </Link>
              </div>
            ) : (
              data.ranked.map((candidate, index) =>
                index === 0 ? (
                  <BestCard
                    key={candidate.dish.id}
                    candidate={candidate}
                    data={data}
                    onChoose={() => choose(candidate.dish.id)}
                    busy={swap.isPending}
                  />
                ) : (
                  <OtherCard
                    key={candidate.dish.id}
                    candidate={candidate}
                    snack={isSnackSlot(data.meal.slot)}
                    onChoose={() => choose(candidate.dish.id)}
                    busy={swap.isPending}
                  />
                ),
              )
            )}
          </section>

          {data.excluded.total > 0 && (
            <div className={styles.excluded}>
              <Icon name="pulse" size={16} />
              <span>
                {t.excluded(
                  data.excluded.total,
                  exclusionParts(
                    data.excluded.byReason,
                    child.avoidAllergens.map((a) => vi.allergens[a]),
                  ).join(', '),
                )}{' '}
                {t.neverRelaxed}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
