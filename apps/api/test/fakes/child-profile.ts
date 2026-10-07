import { Child } from '../../src/modules/child-profile/domain/child.js';
import type { ChildRepository } from '../../src/modules/child-profile/application/ports/out/child.repository.js';
import type { IngredientLookup } from '../../src/modules/child-profile/application/ports/out/ingredient-lookup.port.js';
import { ChildProfileService } from '../../src/modules/child-profile/application/use-cases/child-profile.service.js';
import { FixedClock, RecordingEventBus, SequenceIds } from './kernel.js';

const copy = (child: Child) =>
  Child.restore({
    id: child.id,
    userId: child.userId,
    name: child.name,
    birthDate: child.birthDate,
    isPremature: child.isPremature,
    weeksEarly: child.weeksEarly,
    stageOverride: child.stageOverride,
    priorReaction: child.priorReaction,
    priorReactionNote: child.priorReactionNote,
    avoidAllergens: [...child.avoidAllergens],
    avoidIngredients: child.avoidIngredients.map((i) => ({ ...i })),
    createdAt: child.createdAt,
  });

export class InMemoryChildren implements ChildRepository {
  readonly rows = new Map<string, Child>();
  async create(child: Child) {
    this.rows.set(child.id, copy(child));
  }
  async findOwned(childId: string, userId: string) {
    const child = this.rows.get(childId);
    return child && child.userId === userId ? copy(child) : null;
  }
  async listOwned(userId: string) {
    return [...this.rows.values()]
      .filter((c) => c.userId === userId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(copy);
  }
  async save(child: Child) {
    this.rows.set(child.id, copy(child));
  }
  async deleteOwned(childId: string, userId: string) {
    const child = this.rows.get(childId);
    if (!child || child.userId !== userId) return false;
    this.rows.delete(childId);
    return true;
  }
}

export class FakeIngredients implements IngredientLookup {
  constructor(
    private readonly names: Record<string, string> = {
      ing_muop_dang: 'Mướp đắng',
      ing_ca_rot: 'Cà rốt',
      ing_tom: 'Tôm',
    },
  ) {}
  async findByIds(ids: string[]) {
    return ids.filter((id) => id in this.names).map((id) => ({ id, name: this.names[id]! }));
  }
}

export function childProfileTestbed() {
  // 09:00 in Vietnam on 24/09/2026.
  const clock = new FixedClock(new Date('2026-09-24T02:00:00Z'));
  const ids = new SequenceIds();
  const children = new InMemoryChildren();
  const ingredients = new FakeIngredients();
  const events = new RecordingEventBus();
  const service = new ChildProfileService(children, ingredients, ids, clock, events);
  return { clock, ids, children, ingredients, events, service };
}

export const NA = {
  name: 'Na',
  birthDate: '2026-01-12',
  isPremature: false,
  weeksEarly: 0,
  priorReaction: 'never' as const,
  priorReactionNote: null,
  avoidAllergens: ['egg' as const],
  avoidIngredients: [{ ingredientId: 'ing_muop_dang', reason: 'dislike' as const }],
};
