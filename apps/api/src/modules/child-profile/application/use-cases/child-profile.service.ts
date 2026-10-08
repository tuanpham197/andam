import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import {
  EVENT_BUS,
  type DomainEvent,
  type EventBus,
} from '../../../../shared/kernel/event-bus.port.js';
import { ID_GENERATOR, type IdGenerator } from '../../../../shared/kernel/id-generator.port.js';
import { APP_TIMEZONE, toLocalDate, type LocalDate } from '../../../../shared/kernel/local-date.js';
import {
  Child,
  type Allergen,
  type AvoidIngredient,
  type ChildProfile,
  type CreateChildInput,
  type PriorReaction,
} from '../../domain/child.js';
import { ChildNotFoundError, UnknownIngredientError } from '../../domain/errors.js';
import { CHILD_REPOSITORY, type ChildRepository } from '../ports/out/child.repository.js';
import { INGREDIENT_LOOKUP, type IngredientLookup } from '../ports/out/ingredient-lookup.port.js';
import type { MemberRole } from '../../domain/membership.js';
import { ChildAccessService } from './child-access.service.js';

export type NewChild = Omit<CreateChildInput, 'id' | 'userId'>;

export const PROFILE_CHANGED = 'ProfileChanged';

export interface ProfileChangedEvent extends DomainEvent {
  type: typeof PROFILE_CHANGED;
  childId: string;
  userId: string;
}

export interface ChildChanges {
  name?: string;
  birthDate?: LocalDate;
  isPremature?: boolean;
  weeksEarly?: number;
  /** `null` clears the override, `undefined` leaves it unchanged. */
  stageOverride?: number | null;
  priorReaction?: PriorReaction;
  priorReactionNote?: string | null;
}

export interface ChildView extends ChildProfile {
  id: string;
  name: string;
  initials: string;
  birthDate: LocalDate;
  isPremature: boolean;
  weeksEarly: number;
  priorReaction: PriorReaction;
  priorReactionNote: string | null;
  avoidAllergens: Allergen[];
  avoidIngredients: (AvoidIngredient & { name: string | null })[];
  stageOverride: number | null;
  /** The signed-in user's role for this child (BR-73). */
  role: MemberRole;
}

/** Child profile use cases (UC-01..03, NFR-019). Every call is scoped to the signed-in user. */
@Injectable()
export class ChildProfileService {
  constructor(
    @Inject(CHILD_REPOSITORY) private readonly children: ChildRepository,
    @Inject(INGREDIENT_LOOKUP) private readonly ingredients: IngredientLookup,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_BUS) private readonly events: EventBus,
    @Inject(ChildAccessService) private readonly access: ChildAccessService,
  ) {}

  /** Lets the planning module refresh future meals (BR-31). */
  private profileChanged(userId: string, childId: string): Promise<void> {
    return this.events.publish<ProfileChangedEvent>({ type: PROFILE_CHANGED, childId, userId });
  }

  private today(): LocalDate {
    return toLocalDate(this.clock.now(), APP_TIMEZONE);
  }

  private async owned(userId: string, childId: string): Promise<Child> {
    const child = await this.children.findOwned(childId, userId);
    if (!child) throw new ChildNotFoundError();
    return child;
  }

  private async assertIngredientsExist(items: AvoidIngredient[]): Promise<void> {
    const ids = [...new Set(items.map((i) => i.ingredientId))];
    const found = new Set((await this.ingredients.findByIds(ids)).map((i) => i.id));
    const unknown = ids.filter((id) => !found.has(id));
    if (unknown.length > 0) throw new UnknownIngredientError(unknown);
  }

  private async view(child: Child, role: MemberRole, today = this.today()): Promise<ChildView> {
    const names = new Map(
      (await this.ingredients.findByIds(child.avoidIngredients.map((i) => i.ingredientId))).map(
        (i) => [i.id, i.name],
      ),
    );
    return {
      id: child.id,
      name: child.name,
      initials: child.initials,
      birthDate: child.birthDate,
      isPremature: child.isPremature,
      weeksEarly: child.weeksEarly,
      priorReaction: child.priorReaction,
      priorReactionNote: child.priorReactionNote,
      avoidAllergens: child.avoidAllergens,
      avoidIngredients: child.avoidIngredients.map((i) => ({
        ...i,
        name: names.get(i.ingredientId) ?? null,
      })),
      stageOverride: child.stageOverride,
      role,
      ...child.profile(today),
    };
  }

  private applyChanges(child: Child, changes: ChildChanges, today: LocalDate): void {
    if (changes.name !== undefined) child.rename(changes.name);
    if (
      changes.birthDate !== undefined ||
      changes.isPremature !== undefined ||
      changes.weeksEarly !== undefined
    ) {
      child.changeBirth(
        {
          birthDate: changes.birthDate ?? child.birthDate,
          isPremature: changes.isPremature ?? child.isPremature,
          weeksEarly: changes.weeksEarly ?? child.weeksEarly,
        },
        today,
      );
    }
    if (changes.stageOverride !== undefined) child.setStageOverride(changes.stageOverride, today);
    if (changes.priorReaction !== undefined) {
      child.setPriorReaction(changes.priorReaction, changes.priorReactionNote ?? null);
    }
  }

  async create(userId: string, input: NewChild): Promise<ChildView> {
    const now = this.clock.now();
    const today = toLocalDate(now, APP_TIMEZONE);
    const child = Child.create({ ...input, id: this.ids.next(), userId }, today, now);
    await this.assertIngredientsExist(child.avoidIngredients);
    await this.children.create(child);
    return this.view(child, 'owner', today);
  }

  async list(userId: string): Promise<ChildView[]> {
    const today = this.today();
    const [children, roles] = await Promise.all([
      this.children.listOwned(userId),
      this.access.rolesOf(userId),
    ]);
    return Promise.all(children.map((c) => this.view(c, roles.get(c.id)!, today)));
  }

  async get(userId: string, childId: string): Promise<ChildView> {
    const role = await this.access.require(userId, childId, 'view');
    return this.view(await this.owned(userId, childId), role);
  }

  async update(userId: string, childId: string, changes: ChildChanges): Promise<ChildView> {
    await this.access.require(userId, childId, 'edit_profile');
    const child = await this.owned(userId, childId);
    const today = this.today();
    this.applyChanges(child, changes, today);
    await this.children.save(child);
    await this.profileChanged(userId, childId);
    return this.view(child, 'owner', today);
  }

  async replaceAvoidList(
    userId: string,
    childId: string,
    lists: { allergens: Allergen[]; ingredients: AvoidIngredient[] },
  ): Promise<ChildView> {
    await this.access.require(userId, childId, 'edit_profile');
    const child = await this.owned(userId, childId);
    child.replaceAvoidList(lists.allergens, lists.ingredients);
    await this.assertIngredientsExist(child.avoidIngredients);
    await this.children.save(child);
    await this.profileChanged(userId, childId);
    return this.view(child, 'owner');
  }

  /** Applies birth/stage changes to a copy and returns the resulting profile; nothing is saved. */
  async previewStage(
    userId: string,
    childId: string,
    changes: Pick<ChildChanges, 'birthDate' | 'isPremature' | 'weeksEarly'> & {
      stage?: number | null;
    },
  ): Promise<ChildProfile> {
    const child = await this.owned(userId, childId);
    const today = this.today();
    const { stage, ...birth } = changes;
    this.applyChanges(child, { ...birth, stageOverride: stage }, today);
    return child.profile(today);
  }

  async remove(userId: string, childId: string): Promise<void> {
    await this.access.require(userId, childId, 'delete_child');
    if (!(await this.children.deleteOwned(childId, userId))) throw new ChildNotFoundError();
  }
}
