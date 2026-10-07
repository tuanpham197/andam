import type { MealDishDtoFoodGroupsItem, MealDishDtoMainProtein } from '@appandam/api-client';
import { vi } from '../../strings/vi';
import styles from './FoodGroupTags.module.css';

const ORDER: MealDishDtoFoodGroupsItem[] = ['carb', 'protein', 'fat', 'veg'];

/** The four food groups of a meal (BR-20); fruit already counts as "Rau củ" server side. */
export function FoodGroupTags({
  groups,
  protein = null,
  score,
}: {
  groups: readonly MealDishDtoFoodGroupsItem[];
  protein?: MealDishDtoMainProtein;
  /** Main meals aim for all four groups; snacks are not scored. */
  score: boolean;
}) {
  const present = ORDER.filter((group) => groups.includes(group));
  return (
    <div className={styles.tags}>
      {present.map((group) => (
        <span key={group} className={`${styles.tag} ${styles[group]}`}>
          {group === 'protein' && protein
            ? `${vi.foodGroups.protein} · ${vi.proteins[protein]}`
            : vi.foodGroups[group]}
        </span>
      ))}
      {score && <span className={styles.score}>{vi.groupsMet(present.length)}</span>}
    </div>
  );
}
