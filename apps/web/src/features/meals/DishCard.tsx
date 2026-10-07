import type { LibraryDishDto } from '@appandam/api-client';
import { Link } from 'react-router';
import { Icon } from '../../components/Icon';
import { vi } from '../../strings/vi';
import { textureLabel } from '../child/format';
import styles from './DishCard.module.css';
import { eatenTag } from './explain';
import { firstTryNames } from './format';

/** A library card (S05): photo placeholder tinted by protein, timing, group and tags. */
export function DishCard({ dish }: { dish: LibraryDishDto }) {
  const tint = dish.mealType === 'snack' ? 'snack' : (dish.mainProtein ?? 'snack');
  const group =
    dish.mealType === 'snack'
      ? vi.library.snack
      : dish.mainProtein
        ? vi.proteins[dish.mainProtein]
        : vi.library.main;
  return (
    <Link to={`/dishes/${dish.id}`} className={styles.card}>
      <div className={`${styles.photo} ${styles[tint]}`} aria-hidden="true">
        <Icon name="bowl" size={28} />
      </div>
      <div className={styles.body}>
        <span className={styles.name}>{dish.name}</span>
        <span className={styles.meta}>
          {vi.minutes(dish.prepMin + dish.cookMin)} · {textureLabel(dish.texture)}
        </span>
        <div className={styles.tags}>
          <span className={`${styles.tag} ${styles.group}`}>{group}</span>
          {dish.newIngredients.length > 0 && (
            <span className={`${styles.tag} ${styles.new}`}>
              {vi.library.firstTry(firstTryNames(dish.newIngredients.map((i) => i.name)))}
            </span>
          )}
          {dish.liked && (
            <span className={`${styles.tag} ${styles.liked}`}>{vi.library.liked}</span>
          )}
          {dish.lastEaten && (
            <span className={`${styles.tag} ${styles.recent}`}>{eatenTag(dish.lastEaten)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
