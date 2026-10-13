import type { DayProteinDto, MealDto } from '@appandam/api-client';
import { Link } from 'react-router';
import { AlertBox } from '../../components/AlertBox';
import { Icon } from '../../components/Icon';
import { messageFor } from '../../lib/errors';
import { vi } from '../../strings/vi';
import { textureLabel } from '../child/format';
import { reasonText } from './explain';
import { countdown, firstTryNames, isSnackSlot, mealInstant, slotLabel } from './format';
import { FoodGroupTags } from './FoodGroupTags';
import { QUICK_AMOUNTS, type QuickAmount } from './use-quick-log';
import styles from './NextMealCard.module.css';

const t = vi.today;

const SHOWN_REASONS = 2;

/** FR-142: why this dish, in the parent's words; a dish they chose themselves says so. */
function Why({ meal, otherMains }: { meal: MealDto; otherMains: DayProteinDto[] }) {
  const lines =
    meal.source === 'auto'
      ? meal.reasons
          .slice(0, SHOWN_REASONS)
          .map((code) =>
            reasonText(code, { protein: meal.dish.mainProtein, otherMains, fasterByMin: 0 }),
          )
      : [t.chosenByYou];
  if (lines.length === 0) return null;
  return (
    <ul aria-label={t.whyTitle} className={styles.why}>
      {lines.map((line) => (
        <li key={line}>
          <Icon name="check" size={14} />
          {line}
        </li>
      ))}
    </ul>
  );
}

export function NextMealCard({
  meal,
  date,
  now,
  onPrepare,
  preparing,
  error,
  otherMains,
  onQuickLog,
  quickLogging = false,
  quickError = null,
}: {
  meal: MealDto;
  /** FR-144: shown once the meal is due or cooked. */
  onQuickLog?: (amount: QuickAmount) => void;
  quickLogging?: boolean;
  quickError?: unknown;
  /** The day's other main meals, to say "khác nguồn đạm bữa tối (gà)". */
  otherMains: DayProteinDto[];
  date: string;
  now: Date;
  onPrepare: () => void;
  preparing: boolean;
  error: unknown;
}) {
  const prepared = meal.status === 'prepared';
  const due = prepared || mealInstant(date, meal.time).getTime() <= now.getTime();
  const logUrl = `/meals/${meal.id}/log`;
  const swap = (
    <Link to={`/meals/${meal.id}/swap`} className={styles.action}>
      <Icon name="swap" size={16} />
      {t.swap}
    </Link>
  );
  const reaction = (
    <Link to={`${logUrl}?reaction=1`} className={`${styles.action} ${styles.reaction}`}>
      {t.reaction}
    </Link>
  );

  return (
    <section aria-label={t.nextMeal} className={styles.card}>
      <div className={styles.top}>
        <span className={styles.eyebrow}>{t.nextMealAt(slotLabel(meal.slot), meal.time)}</span>
        <span className={styles.countdown}>{countdown(mealInstant(date, meal.time), now)}</span>
      </div>
      <h2 className={styles.name}>{meal.dish.name}</h2>
      <div className={styles.meta}>
        <span className={styles.duration}>
          <Icon name="clock" size={15} />
          {vi.minutes(meal.dish.prepMin + meal.dish.cookMin)}
        </span>
        <span>{textureLabel(meal.texture)}</span>
        <span>{meal.portionText}</span>
      </div>
      <FoodGroupTags
        groups={meal.dish.foodGroups}
        protein={meal.dish.mainProtein}
        score={!isSnackSlot(meal.slot)}
      />
      {meal.replanCause && <AlertBox tone="info">{t.replanned[meal.replanCause]}</AlertBox>}
      <Why meal={meal} otherMains={otherMains} />
      {meal.newIngredients.length > 0 && (
        <AlertBox
          tone="warn"
          title={t.firstTry(firstTryNames(meal.newIngredients.map((i) => i.name)))}
        >
          {t.firstTryAdvice}
        </AlertBox>
      )}
      <div className={styles.actions}>
        {prepared ? (
          <>
            <AlertBox tone="info">{t.preparedDone}</AlertBox>
            <Link to={logUrl} className={styles.primary}>
              <Icon name="check" size={18} />
              {t.ate}
            </Link>
            <div className={styles.grid} data-columns="2">
              {swap}
              {reaction}
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              className={styles.primary}
              onClick={onPrepare}
              disabled={preparing}
            >
              <Icon name="check" size={18} />
              {t.prepared}
            </button>
            <div className={styles.grid}>
              {swap}
              <Link to={logUrl} className={styles.action}>
                {t.ate}
              </Link>
              {reaction}
            </div>
          </>
        )}
        {error != null && <AlertBox tone="danger">{messageFor(error)}</AlertBox>}
        {due && onQuickLog && (
          <div role="group" aria-label={t.quickLog} className={styles.quick}>
            <span className={styles.quickLabel}>{t.quickLog}</span>
            <div className={styles.grid}>
              {QUICK_AMOUNTS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  className={styles.action}
                  disabled={quickLogging}
                  onClick={() => onQuickLog(amount)}
                >
                  {t.quickAmounts[amount]}
                </button>
              ))}
            </div>
            <span className={styles.quickHint}>{t.quickLogHint}</span>
          </div>
        )}
        {quickError != null && <AlertBox tone="danger">{messageFor(quickError)}</AlertBox>}
      </div>
    </section>
  );
}
