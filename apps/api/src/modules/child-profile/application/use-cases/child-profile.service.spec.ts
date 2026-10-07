import { NA, childProfileTestbed } from '../../../../../test/fakes/child-profile.js';
import {
  ChildNotFoundError,
  InvalidWeeksEarlyError,
  StageAboveAgeError,
  UnknownIngredientError,
} from '../../domain/errors.js';

const USER = 'u-1';
const OTHER = 'u-2';

describe('ChildProfileService', () => {
  describe('create (UC-01)', () => {
    it('TC-CHD-001 stores the child and returns its full view', async () => {
      const t = childProfileTestbed();
      const view = await t.service.create(USER, NA);
      expect(view).toEqual({
        id: expect.any(String),
        name: 'Na',
        initials: 'Na',
        birthDate: '2026-01-12',
        isPremature: false,
        weeksEarly: 0,
        priorReaction: 'never',
        priorReactionNote: null,
        avoidAllergens: ['egg'],
        avoidIngredients: [{ ingredientId: 'ing_muop_dang', name: 'Mướp đắng', reason: 'dislike' }],
        stageOverride: null,
        age: { months: 8, days: 12, corrected: false },
        autoStage: 2,
        effectiveStage: 2,
        isOverride: false,
        plannable: true,
        notPlannableReason: null,
        stages: expect.any(Array),
      });
      expect(t.children.rows.size).toBe(1);
    });

    it('TC-CHD-008 refuses unknown ingredients and stores nothing', async () => {
      const t = childProfileTestbed();
      const error = await t.service
        .create(USER, {
          ...NA,
          avoidIngredients: [{ ingredientId: 'ing_khong_co', reason: 'dislike' }],
        })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(UnknownIngredientError);
      expect((error as UnknownIngredientError).ingredientIds).toEqual(['ing_khong_co']);
      expect(t.children.rows.size).toBe(0);
    });

    it('TC-AGE-016 computes today in Vietnam time', async () => {
      const t = childProfileTestbed();
      t.clock.set('2026-09-23T17:30:00Z'); // 00:30 on 24/09 in Vietnam
      expect((await t.service.create(USER, NA)).age).toEqual({
        months: 8,
        days: 12,
        corrected: false,
      });
    });
  });

  describe('read', () => {
    it('lists only the caller’s children, oldest profile first', async () => {
      const t = childProfileTestbed();
      await t.service.create(USER, NA);
      t.clock.advance(1000);
      await t.service.create(USER, { ...NA, name: 'Bin' });
      await t.service.create(OTHER, { ...NA, name: 'Khác' });
      expect((await t.service.list(USER)).map((c) => c.name)).toEqual(['Na', 'Bin']);
    });

    it('TC-CHD-013 treats another user’s child as not found', async () => {
      const t = childProfileTestbed();
      const { id } = await t.service.create(OTHER, NA);
      await expect(t.service.get(USER, id)).rejects.toThrow(ChildNotFoundError);
    });

    it('drops the name of an ingredient that disappeared from the catalog', async () => {
      const t = childProfileTestbed();
      const { id } = await t.service.create(USER, {
        ...NA,
        avoidIngredients: [{ ingredientId: 'ing_ca_rot', reason: 'not_eat' }],
      });
      const [stored] = t.children.rows.values();
      stored!.replaceAvoidList([], [{ ingredientId: 'ing_bien_mat', reason: 'dislike' }]);
      await t.children.save(stored!);
      expect((await t.service.get(USER, id)).avoidIngredients).toEqual([
        { ingredientId: 'ing_bien_mat', name: null, reason: 'dislike' },
      ]);
    });
  });

  describe('update (UC-03)', () => {
    it('renames, changes the birth info and the stage in one call', async () => {
      const t = childProfileTestbed();
      const { id } = await t.service.create(USER, NA);
      const view = await t.service.update(USER, id, {
        name: 'Na Na',
        birthDate: '2025-12-01',
        isPremature: false,
        weeksEarly: 0,
        stageOverride: 1,
      });
      expect(view).toMatchObject({
        name: 'Na Na',
        autoStage: 2,
        effectiveStage: 1,
        isOverride: true,
      });
    });

    it('leaves the override alone when the field is absent, clears it with null', async () => {
      const t = childProfileTestbed();
      const { id } = await t.service.create(USER, NA);
      await t.service.update(USER, id, { stageOverride: 1 });
      expect((await t.service.update(USER, id, { name: 'Na' })).isOverride).toBe(true);
      expect((await t.service.update(USER, id, { stageOverride: null })).isOverride).toBe(false);
    });

    it('updates the prior reaction', async () => {
      const t = childProfileTestbed();
      const { id } = await t.service.create(USER, NA);
      const view = await t.service.update(USER, id, {
        priorReaction: 'yes',
        priorReactionNote: 'mẩn',
      });
      expect([view.priorReaction, view.priorReactionNote]).toEqual(['yes', 'mẩn']);
    });

    it('keeps other birth fields when only one is sent', async () => {
      const t = childProfileTestbed();
      const { id } = await t.service.create(USER, NA);
      const view = await t.service.update(USER, id, { isPremature: true, weeksEarly: 3 });
      expect(view).toMatchObject({
        birthDate: '2026-01-12',
        age: { months: 7, days: 22, corrected: true },
      });
    });

    it('TC-STG-002 rejects a stage above the age and saves nothing', async () => {
      const t = childProfileTestbed();
      const { id } = await t.service.create(USER, NA);
      await expect(t.service.update(USER, id, { name: 'Đổi', stageOverride: 3 })).rejects.toThrow(
        StageAboveAgeError,
      );
      expect((await t.service.get(USER, id)).name).toBe('Na');
    });

    it('refuses to update another user’s child', async () => {
      const t = childProfileTestbed();
      const { id } = await t.service.create(OTHER, NA);
      await expect(t.service.update(USER, id, { name: 'x' })).rejects.toThrow(ChildNotFoundError);
    });
  });

  describe('replaceAvoidList (UC-02)', () => {
    it('replaces the lists and resolves names', async () => {
      const t = childProfileTestbed();
      const { id } = await t.service.create(USER, NA);
      const view = await t.service.replaceAvoidList(USER, id, {
        allergens: ['fish', 'fish'],
        ingredients: [{ ingredientId: 'ing_tom', reason: 'not_eat' }],
      });
      expect(view.avoidAllergens).toEqual(['fish']);
      expect(view.avoidIngredients).toEqual([
        { ingredientId: 'ing_tom', name: 'Tôm', reason: 'not_eat' },
      ]);
    });

    it('refuses unknown ingredients', async () => {
      const t = childProfileTestbed();
      const { id } = await t.service.create(USER, NA);
      await expect(
        t.service.replaceAvoidList(USER, id, {
          allergens: [],
          ingredients: [{ ingredientId: 'ing_x', reason: 'dislike' }],
        }),
      ).rejects.toThrow(UnknownIngredientError);
    });

    it('refuses another user’s child', async () => {
      const t = childProfileTestbed();
      const { id } = await t.service.create(OTHER, NA);
      await expect(
        t.service.replaceAvoidList(USER, id, { allergens: [], ingredients: [] }),
      ).rejects.toThrow(ChildNotFoundError);
    });
  });

  describe('ProfileChanged (BR-31: future meals follow the profile)', () => {
    it('is published after an update and after replacing the avoid list', async () => {
      const t = childProfileTestbed();
      const { id } = await t.service.create(USER, NA);
      expect(t.events.published).toEqual([]);
      await t.service.update(USER, id, { name: 'Bin' });
      await t.service.replaceAvoidList(USER, id, { allergens: ['fish'], ingredients: [] });
      expect(t.events.published).toEqual([
        { type: 'ProfileChanged', childId: id, userId: USER },
        { type: 'ProfileChanged', childId: id, userId: USER },
      ]);
    });

    it('is not published when the change is rejected', async () => {
      const t = childProfileTestbed();
      const { id } = await t.service.create(USER, NA);
      await expect(t.service.update(USER, id, { stageOverride: 3 })).rejects.toThrow();
      await expect(
        t.service.replaceAvoidList(USER, id, {
          allergens: [],
          ingredients: [{ ingredientId: 'ing_x', reason: 'dislike' }],
        }),
      ).rejects.toThrow();
      expect(t.events.published).toEqual([]);
    });

    it('is not published by a preview', async () => {
      const t = childProfileTestbed();
      const { id } = await t.service.create(USER, NA);
      await t.service.previewStage(USER, id, { stage: 1 });
      expect(t.events.published).toEqual([]);
    });
  });

  describe('previewStage (S10 live preview)', () => {
    it('shows the effect of premature birth without saving it', async () => {
      const t = childProfileTestbed();
      const { id } = await t.service.create(USER, NA);
      const preview = await t.service.previewStage(USER, id, { isPremature: true, weeksEarly: 3 });
      expect(preview).toMatchObject({
        age: { months: 7, days: 22, corrected: true },
        autoStage: 1,
      });
      expect((await t.service.get(USER, id)).isPremature).toBe(false);
    });

    it('previews a chosen stage', async () => {
      const t = childProfileTestbed();
      const { id } = await t.service.create(USER, NA);
      expect(await t.service.previewStage(USER, id, { stage: 1 })).toMatchObject({
        effectiveStage: 1,
        isOverride: true,
      });
    });

    it('validates like a real change', async () => {
      const t = childProfileTestbed();
      const { id } = await t.service.create(USER, NA);
      await expect(
        t.service.previewStage(USER, id, { isPremature: true, weeksEarly: 0 }),
      ).rejects.toThrow(InvalidWeeksEarlyError);
    });

    it('refuses another user’s child', async () => {
      const t = childProfileTestbed();
      const { id } = await t.service.create(OTHER, NA);
      await expect(t.service.previewStage(USER, id, {})).rejects.toThrow(ChildNotFoundError);
    });
  });

  describe('remove (NFR-019)', () => {
    it('deletes the caller’s child once', async () => {
      const t = childProfileTestbed();
      const { id } = await t.service.create(USER, NA);
      await t.service.remove(USER, id);
      expect(t.children.rows.size).toBe(0);
      await expect(t.service.remove(USER, id)).rejects.toThrow(ChildNotFoundError);
    });

    it('cannot delete another user’s child', async () => {
      const t = childProfileTestbed();
      const { id } = await t.service.create(OTHER, NA);
      await expect(t.service.remove(USER, id)).rejects.toThrow(ChildNotFoundError);
      expect(t.children.rows.size).toBe(1);
    });
  });
});
