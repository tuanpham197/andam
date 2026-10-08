import { useGetRecipe, useListStages, type RecipeDto } from '@appandam/api-client';
import { keepPreviousData } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { AlertBox } from '../components/AlertBox';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { LoadError } from '../components/LoadError';
import { SegmentedTabs } from '../components/SegmentedTabs';
import { stageRange, textureLabel } from '../features/child/format';
import { useActiveChild } from '../features/child/guards';
import { formatQty } from '../features/meals/format';
import { vi } from '../strings/vi';
import styles from './RecipePage.module.css';

const t = vi.recipe;

function BackLink({ to }: { to: string }) {
  return (
    <Link to={to} aria-label={vi.common.back} className={styles.back}>
      <Icon name="back" />
    </Link>
  );
}

function Hero({ recipe, back }: { recipe: RecipeDto; back: string }) {
  return (
    <div className={`${styles.hero} ${styles[recipe.mealType]}`}>
      {recipe.imageUrl ? (
        <img src={recipe.imageUrl} alt={recipe.name} className={styles.photo} />
      ) : (
        <div className={styles.placeholder}>
          <Icon name="bowl" size={32} />
          {t.photo}
        </div>
      )}
      <BackLink to={back} />
    </div>
  );
}

function ByAge({ recipe, onStage }: { recipe: RecipeDto; onStage: (stage: number) => void }) {
  const stages = useListStages().data;
  const variant = recipe.variants.find((v) => v.stage === recipe.selectedStage)!;
  const tabs = recipe.stages.map((id) => {
    const stage = stages?.find((s) => s.id === id);
    return { id: String(id), label: stage ? stageRange(stage) : vi.today.stage(id) };
  });
  return (
    <section aria-label={t.byAgeLabel} className={styles.section}>
      <h2 className={styles.heading}>{t.byAge}</h2>
      <SegmentedTabs
        label={t.byAge}
        tabs={tabs}
        value={String(recipe.selectedStage)}
        onChange={(id) => onStage(Number(id))}
      />
      <dl className={styles.pairs}>
        <div>
          <dt>{t.texture}</dt>
          <dd>{textureLabel(variant.texture)}</dd>
        </div>
        <div>
          <dt>{t.portion}</dt>
          <dd>{variant.portionText}</dd>
        </div>
      </dl>
    </section>
  );
}

function Ingredients({ recipe }: { recipe: RecipeDto }) {
  return (
    <section aria-label={t.ingredientsLabel} className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.heading}>{t.ingredients}</h2>
        {recipe.mealType === 'main' && (
          <span className={styles.score}>{vi.groupsMet(recipe.foodGroups.length)}</span>
        )}
      </div>
      <ul className={styles.card}>
        {recipe.ingredients.map((i) => (
          <li key={i.ingredientId} className={styles.ingredient}>
            <span className={styles.ingredientName}>
              {i.name}
              {i.isNew && <span className={styles.firstTry}> {t.firstTry}</span>}
            </span>
            <span>{formatQty(i.qty, i.unit)}</span>
            <span className={`${styles.group} ${styles[i.foodGroup]}`}>
              {vi.foodGroups[i.foodGroup]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Safety({ recipe }: { recipe: RecipeDto }) {
  if (recipe.allergens.length === 0 && recipe.safetyNotes.length === 0) return null;
  const allergens = recipe.allergens.map((a) => vi.allergens[a].toLocaleLowerCase('vi'));
  return (
    <section aria-label={t.safety} className={styles.safety}>
      <div className={styles.safetyTitle}>
        <Icon name="pulse" size={16} />
        {t.safety}
      </div>
      <ul>
        {allergens.length > 0 && (
          <li>
            {t.allergens} <strong>{allergens.join(', ')}</strong>.
          </li>
        )}
        {recipe.safetyNotes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}

function Recipe({
  recipe,
  meal,
  back,
  onStage,
}: {
  recipe: RecipeDto;
  meal: string | null;
  back: string;
  onStage: (stage: number) => void;
}) {
  const stepsHeading = useRef<HTMLHeadingElement>(null);
  const variant = recipe.variants.find((v) => v.stage === recipe.selectedStage)!;

  function startCooking() {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    stepsHeading.current!.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    stepsHeading.current!.focus();
  }

  return (
    <div className={styles.page}>
      <Hero recipe={recipe} back={back} />
      <div className={styles.content}>
        {recipe.exclusion && (
          <AlertBox tone="danger" title={t.excluded}>
            {t.exclusions[recipe.exclusion]}
          </AlertBox>
        )}
        <div className={styles.intro}>
          {recipe.custom ? (
            <div className={`${styles.review} ${styles.customReview}`}>
              <span className={styles.custom}>{t.custom}</span>
              <span>{t.customNote}</span>
            </div>
          ) : (
            <div className={styles.review}>
              <span className={recipe.reviewedBy ? styles.reviewed : undefined}>
                {recipe.reviewedBy ? t.reviewed : t.notReviewed}
              </span>
              <span aria-hidden="true">·</span>
              <span>{t.version(recipe.contentVersion)}</span>
            </div>
          )}
          <h1 className={styles.title}>{recipe.name}</h1>
          {recipe.description && <p className={styles.description}>{recipe.description}</p>}
          {recipe.custom && (
            <Link to={`/dishes/${recipe.id}/edit`} className={styles.edit}>
              {t.edit}
            </Link>
          )}
        </div>
        <ul aria-label={t.facts} className={styles.facts}>
          {[
            [t.prep, vi.minutes(recipe.prepMin)],
            [t.cook, vi.minutes(recipe.cookMin)],
            [t.texture, textureLabel(variant.texture)],
            [t.tool, recipe.tool],
          ]
            .filter(([, value]) => value !== '')
            .map(([label, value]) => (
              <li key={label}>
                <span className={styles.factLabel}>{label}</span>
                <span className={styles.factValue}>{value}</span>
              </li>
            ))}
        </ul>
        <ByAge recipe={recipe} onStage={onStage} />
        <Ingredients recipe={recipe} />
        <Safety recipe={recipe} />
        <section aria-label={t.steps} className={styles.section}>
          <h2 ref={stepsHeading} tabIndex={-1} className={styles.heading}>
            {t.steps}
          </h2>
          <ol className={styles.steps}>
            {recipe.steps.map((step, index) => (
              <li key={step}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <div className={styles.bar}>
        {meal && (
          <Link to={`/meals/${meal}/swap`} className={styles.swap}>
            {t.swap}
          </Link>
        )}
        <Button onClick={startCooking} className={styles.cook}>
          {t.startCooking}
        </Button>
      </div>
    </div>
  );
}

/** S03: a dish adapted to the child's stage (UC-05); `?meal=` when opened from a planned meal. */
export function RecipePage() {
  const child = useActiveChild();
  const { dishId } = useParams() as { dishId: string };
  const [params] = useSearchParams();
  const meal = params.get('meal');
  const back = meal ? '/' : '/dishes';
  const [stage, setStage] = useState<number>();
  const recipe = useGetRecipe(child.id, dishId, stage === undefined ? undefined : { stage }, {
    query: { placeholderData: keepPreviousData },
  });

  if (recipe.isPending)
    return (
      <p role="status" className={styles.status}>
        {vi.common.loading}
      </p>
    );
  if (recipe.isError) {
    const notFound = recipe.error.code === 'DISH_NOT_FOUND';
    return (
      <div className={styles.status}>
        <BackLink to={back} />
        {notFound ? (
          <AlertBox tone="info">{vi.errors.DISH_NOT_FOUND}</AlertBox>
        ) : (
          <LoadError error={recipe.error} retry={() => recipe.refetch()} />
        )}
      </div>
    );
  }
  return <Recipe recipe={recipe.data} meal={meal} back={back} onStage={setStage} />;
}
