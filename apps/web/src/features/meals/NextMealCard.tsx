import type { MealDto } from '@appandam/api-client';
import { Link } from 'react-router';
import { AlertBox } from '../../components/AlertBox';
import { Icon } from '../../components/Icon';
import { messageFor } from '../../lib/errors';
import { vi } from '../../strings/vi';
import { textureLabel } from '../child/format';
import { countdown, firstTryNames, isSnackSlot, mealInstant, slotLabel } from './format';
import { FoodGroupTags } from './FoodGroupTags';
import styles from './NextMealCard.module.css';

const t = vi.today;

export function NextMealCard({
  meal,
  date,
  now,
  onPrepare,
  preparing,
  error,
}: {
  meal: MealDto;
  date: string;
  now: Date;
  onPrepare: () => void;
  preparing: boolean;
  error: unknown;
}) {
  const prepared = meal.status === 'prepared';
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
      </div>
    </section>
  );
}
