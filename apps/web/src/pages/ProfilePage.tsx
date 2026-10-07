import {
  getListChildrenQueryKey,
  useDeleteChild,
  useListStages,
  useReplaceAvoidList,
} from '@appandam/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import styles from '../app/layout.module.css';
import { AlertBox } from '../components/AlertBox';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { Icon } from '../components/Icon';
import { AvoidFoodsEditor } from '../features/child/AvoidFoodsEditor';
import { formatAge, textureLabel } from '../features/child/format';
import { useActiveChild } from '../features/child/guards';
import type { DraftIngredient } from '../features/onboarding/draft';
import { messageFor } from '../lib/errors';
import { vi } from '../strings/vi';

const t = vi.profile;

function AvoidList() {
  const child = useActiveChild();
  const [editing, setEditing] = useState(false);
  const [allergens, setAllergens] = useState(child.avoidAllergens);
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([]);
  const replace = useReplaceAvoidList();
  const queryClient = useQueryClient();

  function edit() {
    setAllergens(child.avoidAllergens);
    setIngredients(
      child.avoidIngredients.map((i) => ({
        ingredientId: i.ingredientId,
        name: i.name ?? i.ingredientId,
        reason: i.reason,
      })),
    );
    replace.reset();
    setEditing(true);
  }

  async function save() {
    const saved = await replace
      .mutateAsync({
        childId: child.id,
        data: {
          allergens,
          ingredients: ingredients.map(({ ingredientId, reason }) => ({ ingredientId, reason })),
        },
      })
      .catch(() => null);
    if (!saved) return;
    await queryClient.invalidateQueries({ queryKey: getListChildrenQueryKey() });
    setEditing(false);
  }

  const empty = child.avoidAllergens.length === 0 && child.avoidIngredients.length === 0;
  return (
    <section className={styles.card} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={{ fontSize: '1.0625rem' }}>{t.avoidTitle}</h2>
      {editing ? (
        <>
          <AvoidFoodsEditor
            allergens={allergens}
            ingredients={ingredients}
            onAllergensChange={setAllergens}
            onIngredientsChange={setIngredients}
          />
          {replace.error && <AlertBox tone="danger">{messageFor(replace.error)}</AlertBox>}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={save} loading={replace.isPending}>
              {t.save}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              {t.cancel}
            </Button>
          </div>
        </>
      ) : (
        <>
          {empty ? (
            <p className={styles.intro}>{t.avoidEmpty}</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {child.avoidAllergens.map((a) => (
                <Chip key={a} tone="danger">
                  {vi.allergens[a]}
                </Chip>
              ))}
              {child.avoidIngredients.map((i) => (
                <Chip key={i.ingredientId}>
                  {i.name ?? i.ingredientId} · {vi.avoid.reasons[i.reason]}
                </Chip>
              ))}
            </div>
          )}
          <Button variant="secondary" onClick={edit}>
            {t.editAvoid}
          </Button>
        </>
      )}
    </section>
  );
}

function DeleteChild() {
  const child = useActiveChild();
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteChild();
  const queryClient = useQueryClient();

  async function confirm() {
    const done = await remove.mutateAsync({ childId: child.id }).then(
      () => true,
      () => false,
    );
    if (done) await queryClient.invalidateQueries({ queryKey: getListChildrenQueryKey() });
  }

  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        {t.deleteChild}
      </Button>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <AlertBox tone="danger">{t.deleteWarning(child.name)}</AlertBox>
      {remove.error && (
        <p style={{ margin: 0, color: 'var(--danger)' }}>{messageFor(remove.error)}</p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="danger" loading={remove.isPending} onClick={confirm}>
          {t.deleteForever}
        </Button>
        <Button variant="secondary" onClick={() => setConfirming(false)}>
          {t.cancel}
        </Button>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const child = useActiveChild();
  const stage = useListStages().data?.find((s) => s.id === child.effectiveStage);
  const stageText = !child.plannable
    ? t.notPlannable
    : stage
      ? `${stage.name} · ${textureLabel(stage.texture)}`
      : `Giai đoạn ${child.effectiveStage}`;
  const summary = `${formatAge(child.age)} · ${stageText}`;

  return (
    <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div
          aria-hidden="true"
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            background: 'var(--primary-soft)',
            color: 'var(--primary-strong)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-heading)',
            fontWeight: 600,
            fontSize: 19,
          }}
        >
          {child.initials}
        </div>
        <div>
          <h1 className={styles.title}>{child.name}</h1>
          <div style={{ color: 'var(--text-2)', fontSize: '0.875rem' }}>{summary}</div>
        </div>
      </div>

      <AvoidList />

      <nav aria-label={t.settings} className={styles.card} style={{ padding: 0 }}>
        {[
          { to: '/settings/age', label: t.ageLink },
          { to: '/account', label: t.accountLink },
        ].map((link) => (
          <Link
            key={link.to}
            to={link.to}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              minHeight: 52,
              padding: '0 16px',
              color: 'var(--text)',
              textDecoration: 'none',
              borderBottom: '1px solid var(--divider)',
            }}
          >
            {link.label}
            <Icon name="chevronRight" size={18} />
          </Link>
        ))}
      </nav>

      <DeleteChild />
    </>
  );
}
