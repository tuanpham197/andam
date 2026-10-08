import {
  ApiError,
  useDeleteCustomDish,
  useCreateCustomDish,
  useGetCustomDish,
  useSearchIngredients,
  useUpdateCustomDish,
  type CustomDishInputDto,
  type MealDishDtoFoodGroupsItem,
} from '@appandam/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { AlertBox } from '../components/AlertBox';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { LoadError } from '../components/LoadError';
import { ScreenHeader } from '../components/ScreenHeader';
import { TextField } from '../components/TextField';
import { useActiveChild } from '../features/child/guards';
import { invalidateChildData } from '../features/child/invalidate';
import { FoodGroupTags } from '../features/meals/FoodGroupTags';
import { messageFor } from '../lib/errors';
import { clearDraft, loadDraft, saveDraft } from '../lib/session-draft';
import { useDebouncedValue } from '../lib/use-debounced-value';
import { vi } from '../strings/vi';
import styles from './CustomDishPage.module.css';

const t = vi.customDish;
const MAX_INGREDIENTS = 15;
const MAX_STEPS = 15;
type MealType = CustomDishInputDto['mealType'];
type UnsafeReason = keyof typeof t.unsafeReasons;

interface DraftIngredient {
  id: string;
  name: string;
  foodGroup: string;
  qty: string;
  unit: string;
}

interface DishDraft {
  name: string;
  mealType: MealType;
  ingredients: DraftIngredient[];
  prepMin: string;
  cookMin: string;
  steps: string[];
}

const EMPTY: DishDraft = {
  name: '',
  mealType: 'main',
  ingredients: [],
  prepMin: '10',
  cookMin: '20',
  steps: [''],
};

const draftKey = (dishId: string | undefined) => `custom-dish-draft:${dishId ?? 'new'}`;

/** The four groups the dish covers, fruit counting as vegetables (FR-023, FR-132). */
function groupsOf(ingredients: DraftIngredient[]): MealDishDtoFoodGroupsItem[] {
  const groups = new Set(ingredients.map((i) => (i.foodGroup === 'fruit' ? 'veg' : i.foodGroup)));
  return (['carb', 'protein', 'fat', 'veg'] as const).filter((g) => groups.has(g));
}

function toInput(draft: DishDraft): CustomDishInputDto {
  const number = (text: string) => Number(text.replace(',', '.'));
  return {
    name: draft.name,
    mealType: draft.mealType,
    ingredients: draft.ingredients.map((i) => ({
      id: i.id,
      qty: i.qty.trim() === '' ? null : number(i.qty),
      unit: i.unit.trim() === '' ? null : i.unit.trim(),
    })),
    prepMin: number(draft.prepMin || '0'),
    cookMin: number(draft.cookMin || '0'),
    steps: draft.steps.filter((s) => s.trim() !== ''),
  };
}

function SaveError({ error }: { error: unknown }) {
  if (error instanceof ApiError && error.code === 'DISH_NOT_SAFE_FOR_CHILD') {
    const items = (error.extensions.ingredients ?? []) as { name: string; reason: UnsafeReason }[];
    return (
      <AlertBox tone="danger">
        {t.unsafe}
        <ul className={styles.unsafe}>
          {items.map((i) => (
            <li key={i.name}>
              <strong>{i.name}</strong> — {t.unsafeReasons[i.reason]}
            </li>
          ))}
        </ul>
      </AlertBox>
    );
  }
  if (error instanceof ApiError && error.code === 'INVALID_CUSTOM_DISH') {
    const field = error.extensions.field as keyof typeof t.fields;
    return <AlertBox tone="danger">{t.fields[field] ?? messageFor(error)}</AlertBox>;
  }
  return <AlertBox tone="danger">{messageFor(error)}</AlertBox>;
}

function IngredientSearch({
  added,
  onAdd,
}: {
  added: string[];
  onAdd: (item: { id: string; name: string; foodGroup: string }) => void;
}) {
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim(), 200);
  const search = useSearchIngredients({ q }, { query: { enabled: q.length > 0 } });
  const searching = query.trim().length > 0 && q.length > 0;
  const results = searching ? (search.data ?? []).filter((r) => !added.includes(r.id)) : [];
  return (
    <div className={styles.search}>
      <TextField
        label={t.search}
        placeholder={t.searchPlaceholder}
        type="search"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {searching && search.isError && <AlertBox tone="danger">{messageFor(search.error)}</AlertBox>}
      {searching && search.isSuccess && search.data.length === 0 && (
        <p className={styles.muted}>{t.noResult}</p>
      )}
      {results.length > 0 && (
        <ul className={styles.results}>
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={styles.result}
                aria-label={t.add(r.name)}
                onClick={() => {
                  onAdd({ id: r.id, name: r.name, foodGroup: r.foodGroup });
                  setQuery('');
                }}
              >
                <span>{r.name}</span>
                <Icon name="plus" size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeleteDish({ dishId, name }: { dishId: string; name: string }) {
  const child = useActiveChild();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const remove = useDeleteCustomDish();
  const [confirming, setConfirming] = useState(false);

  async function confirm() {
    const done = await remove.mutateAsync({ childId: child.id, dishId }).then(
      () => true,
      () => false,
    );
    if (!done) return;
    clearDraft(draftKey(dishId));
    void invalidateChildData(queryClient, child.id);
    void navigate('/dishes', { replace: true });
  }

  if (!confirming) {
    return (
      <Button variant="ghost" onClick={() => setConfirming(true)}>
        <Icon name="trash" size={18} /> {t.delete}
      </Button>
    );
  }
  return (
    <div className={styles.stack}>
      <AlertBox tone="warn">{t.deleteConfirm(name)}</AlertBox>
      {remove.error && <AlertBox tone="danger">{messageFor(remove.error)}</AlertBox>}
      <div className={styles.row}>
        <Button variant="danger" onClick={confirm} loading={remove.isPending}>
          {t.deleteYes}
        </Button>
        <Button variant="secondary" onClick={() => setConfirming(false)}>
          {t.cancel}
        </Button>
      </div>
    </div>
  );
}

function DishForm({ initial, dishId }: { initial: DishDraft; dishId?: string }) {
  const child = useActiveChild();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useCreateCustomDish();
  const update = useUpdateCustomDish();
  const save = dishId ? update : create;
  const [draft, setDraft] = useState<DishDraft>(() => loadDraft(draftKey(dishId)) ?? initial);
  const typeId = useId();

  useEffect(() => saveDraft(draftKey(dishId), draft), [draft, dishId]);

  const change = (changes: Partial<DishDraft>) => setDraft((d) => ({ ...d, ...changes }));
  const setIngredient = (index: number, changes: Partial<DraftIngredient>) =>
    change({
      ingredients: draft.ingredients.map((i, n) => (n === index ? { ...i, ...changes } : i)),
    });
  const groups = groupsOf(draft.ingredients);

  async function submit() {
    const data = toInput(draft);
    const recipe = await (
      dishId
        ? update.mutateAsync({ childId: child.id, dishId, data })
        : create.mutateAsync({ childId: child.id, data })
    ).catch(() => null);
    if (!recipe) return;
    clearDraft(draftKey(dishId));
    void invalidateChildData(queryClient, child.id);
    void navigate(`/dishes/${recipe.id}`, { replace: true });
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <TextField
        label={t.name}
        placeholder={t.namePlaceholder}
        value={draft.name}
        maxLength={60}
        onChange={(e) => change({ name: e.target.value })}
      />

      <fieldset className={styles.fieldset}>
        <legend id={typeId} className={styles.legend}>
          {t.mealType}
        </legend>
        <div className={styles.types}>
          {(Object.keys(t.mealTypes) as MealType[]).map((type) => (
            <button
              key={type}
              type="button"
              className={styles.choice}
              aria-pressed={draft.mealType === type}
              onClick={() => change({ mealType: type })}
            >
              {t.mealTypes[type]}
            </button>
          ))}
        </div>
      </fieldset>

      <section aria-label={t.ingredients} className={styles.stack}>
        <div>
          <h2 className={styles.sectionTitle}>{t.ingredients}</h2>
          <p className={styles.muted}>{t.ingredientsHint}</p>
        </div>
        {draft.ingredients.length > 0 && (
          <ul className={styles.lines}>
            {draft.ingredients.map((item, index) => (
              <li key={item.id} className={styles.line}>
                <span className={styles.lineName}>{item.name}</span>
                <input
                  aria-label={t.qty(item.name)}
                  className={styles.qty}
                  inputMode="decimal"
                  placeholder={t.qtyPlaceholder}
                  value={item.qty}
                  onChange={(e) => setIngredient(index, { qty: e.target.value })}
                />
                <input
                  aria-label={t.unit(item.name)}
                  className={styles.unit}
                  placeholder={t.unitPlaceholder}
                  maxLength={12}
                  value={item.unit}
                  onChange={(e) => setIngredient(index, { unit: e.target.value })}
                />
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={t.remove(item.name)}
                  onClick={() =>
                    change({ ingredients: draft.ingredients.filter((_, n) => n !== index) })
                  }
                >
                  <Icon name="close" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {draft.ingredients.length < MAX_INGREDIENTS && (
          <IngredientSearch
            added={draft.ingredients.map((i) => i.id)}
            onAdd={(item) =>
              change({ ingredients: [...draft.ingredients, { ...item, qty: '', unit: '' }] })
            }
          />
        )}
        <div className={styles.groups}>
          <span className={styles.muted}>{t.groups}</span>
          {groups.length > 0 ? (
            <FoodGroupTags groups={groups} score={draft.mealType === 'main'} />
          ) : (
            <span className={styles.muted}>{t.noGroups}</span>
          )}
        </div>
      </section>

      <div className={styles.times}>
        <TextField
          label={t.prepMin}
          inputMode="numeric"
          value={draft.prepMin}
          onChange={(e) => change({ prepMin: e.target.value.replace(/\D/g, '') })}
        />
        <TextField
          label={t.cookMin}
          inputMode="numeric"
          value={draft.cookMin}
          onChange={(e) => change({ cookMin: e.target.value.replace(/\D/g, '') })}
        />
      </div>

      <section aria-label={t.steps} className={styles.stack}>
        <h2 className={styles.sectionTitle}>{t.steps}</h2>
        <ol className={styles.steps}>
          {draft.steps.map((step, index) => (
            <li key={index} className={styles.step}>
              <textarea
                aria-label={t.step(index + 1)}
                rows={2}
                maxLength={300}
                className={styles.stepText}
                placeholder={t.step(index + 1)}
                value={step}
                onChange={(e) =>
                  change({ steps: draft.steps.map((s, n) => (n === index ? e.target.value : s)) })
                }
              />
              <button
                type="button"
                className={styles.iconButton}
                aria-label={t.removeStep(index + 1)}
                onClick={() => change({ steps: draft.steps.filter((_, n) => n !== index) })}
              >
                <Icon name="close" size={18} />
              </button>
            </li>
          ))}
        </ol>
        {draft.steps.length < MAX_STEPS && (
          <Button variant="secondary" onClick={() => change({ steps: [...draft.steps, ''] })}>
            <Icon name="plus" size={18} /> {t.addStep}
          </Button>
        )}
      </section>

      {save.error != null && <SaveError error={save.error} />}
      <Button type="submit" fullWidth loading={save.isPending}>
        {save.isPending ? t.saving : t.save}
      </Button>
      {dishId && <DeleteDish dishId={dishId} name={initial.name} />}
    </form>
  );
}

function EditDish({ dishId }: { dishId: string }) {
  const child = useActiveChild();
  const query = useGetCustomDish(child.id, dishId);
  if (query.isPending) {
    return (
      <p role="status" className={styles.muted}>
        {vi.common.loading}
      </p>
    );
  }
  if (query.isError) return <LoadError error={query.error} retry={() => query.refetch()} />;
  const dish = query.data;
  return (
    <DishForm
      dishId={dishId}
      initial={{
        name: dish.name,
        mealType: dish.mealType,
        ingredients: dish.ingredients.map((i) => ({
          id: i.id,
          name: i.name,
          foodGroup: i.foodGroup,
          qty: i.qty === null ? '' : String(i.qty),
          unit: i.unit ?? '',
        })),
        prepMin: String(dish.prepMin),
        cookMin: String(dish.cookMin),
        steps: dish.steps.length > 0 ? dish.steps : [''],
      }}
    />
  );
}

/** G15: a parent's own dish ("Món của bạn"), checked against the child's hard filter (UC-23). */
export function CustomDishPage() {
  const { dishId } = useParams() as { dishId?: string };
  return (
    <>
      <ScreenHeader
        title={dishId ? t.editTitle : t.createTitle}
        back={dishId ? `/dishes/${dishId}` : '/dishes'}
        level={1}
      />
      <p className={styles.muted}>{t.intro}</p>
      {dishId ? <EditDish dishId={dishId} /> : <DishForm initial={EMPTY} />}
    </>
  );
}
