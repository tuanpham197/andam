import { useSearchIngredients, type CreateChildDtoAvoidAllergensItem } from '@appandam/api-client';
import { useId, useState } from 'react';
import { AlertBox } from '../../components/AlertBox';
import { Icon } from '../../components/Icon';
import { TextField } from '../../components/TextField';
import { ToggleChip } from '../../components/ToggleChip';
import { messageFor } from '../../lib/errors';
import { useDebouncedValue } from '../../lib/use-debounced-value';
import { vi } from '../../strings/vi';
import type { DraftIngredient } from '../onboarding/draft';
import styles from './AvoidFoodsEditor.module.css';

type Allergen = CreateChildDtoAvoidAllergensItem;

const ALLERGENS = Object.keys(vi.allergens) as Allergen[];

export function AvoidFoodsEditor({
  allergens,
  ingredients,
  onAllergensChange,
  onIngredientsChange,
}: {
  allergens: Allergen[];
  ingredients: DraftIngredient[];
  onAllergensChange: (allergens: Allergen[]) => void;
  onIngredientsChange: (ingredients: DraftIngredient[]) => void;
}) {
  const legendId = useId();
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim(), 200);
  const search = useSearchIngredients({ q }, { query: { enabled: q.length > 0 } });
  const added = new Set(ingredients.map((i) => i.ingredientId));
  // Feedback follows what is in the field now, not the debounced query still in flight.
  const searching = query.trim().length > 0 && q.length > 0;
  const results = searching ? (search.data ?? []).filter((r) => !added.has(r.id)) : [];

  function toggleAllergen(allergen: Allergen, on: boolean) {
    onAllergensChange(on ? [...allergens, allergen] : allergens.filter((a) => a !== allergen));
  }

  function add(result: { id: string; name: string }) {
    onIngredientsChange([
      ...ingredients,
      { ingredientId: result.id, name: result.name, reason: 'dislike' },
    ]);
    setQuery('');
  }

  return (
    <div className={styles.section}>
      <div role="group" aria-labelledby={legendId}>
        <div id={legendId} className={styles.legend}>
          {vi.avoid.allergensLegend}
        </div>
        <div className={styles.chips}>
          {ALLERGENS.map((allergen) => (
            <ToggleChip
              key={allergen}
              tone="danger"
              pressed={allergens.includes(allergen)}
              onPressedChange={(on) => toggleAllergen(allergen, on)}
            >
              {vi.allergens[allergen]}
            </ToggleChip>
          ))}
        </div>
      </div>

      <TextField
        label={vi.avoid.otherLabel}
        placeholder={vi.avoid.otherPlaceholder}
        type="search"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {searching && search.isError && <AlertBox tone="danger">{messageFor(search.error)}</AlertBox>}
      {searching && search.isSuccess && search.data.length === 0 && (
        <p className={styles.muted}>{vi.avoid.noResult}</p>
      )}
      {searching &&
        search.data
          ?.filter((r) => added.has(r.id))
          .map((r) => (
            <p key={r.id} className={styles.muted}>
              {vi.avoid.alreadyAdded(r.name)}
            </p>
          ))}
      {results.length > 0 && (
        <ul className={styles.results}>
          {results.map((result) => (
            <li key={result.id}>
              <button
                type="button"
                className={styles.result}
                aria-label={`${vi.avoid.add} ${result.name}`}
                onClick={() => add(result)}
              >
                + {result.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {ingredients.length > 0 && (
        <div className={styles.chips}>
          {ingredients.map((item) => (
            <span key={item.ingredientId} className={styles.added}>
              <button
                type="button"
                className={styles.addedLabel}
                aria-label={`${vi.avoid.switchReason} ${item.name}`}
                onClick={() =>
                  onIngredientsChange(
                    ingredients.map((i) =>
                      i.ingredientId === item.ingredientId
                        ? { ...i, reason: i.reason === 'dislike' ? 'not_eat' : 'dislike' }
                        : i,
                    ),
                  )
                }
              >
                {item.name} · {vi.avoid.reasons[item.reason]}
              </button>
              <button
                type="button"
                className={styles.remove}
                aria-label={`${vi.avoid.remove} ${item.name}`}
                onClick={() =>
                  onIngredientsChange(
                    ingredients.filter((i) => i.ingredientId !== item.ingredientId),
                  )
                }
              >
                <Icon name="close" size={16} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
