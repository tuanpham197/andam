import { Child } from '../../src/modules/child-profile/domain/child.js';
import { AlreadyMemberError } from '../../src/modules/child-profile/domain/errors.js';
import { ChildInvite } from '../../src/modules/child-profile/domain/invite.js';
import { displayName, type MemberRole } from '../../src/modules/child-profile/domain/membership.js';
import type { ChildRepository } from '../../src/modules/child-profile/application/ports/out/child.repository.js';
import type { IngredientLookup } from '../../src/modules/child-profile/application/ports/out/ingredient-lookup.port.js';
import type { InviteRepository } from '../../src/modules/child-profile/application/ports/out/invite.repository.js';
import type { InviteTokens } from '../../src/modules/child-profile/application/ports/out/invite-tokens.port.js';
import type {
  MembershipRepository,
  NewMember,
} from '../../src/modules/child-profile/application/ports/out/membership.repository.js';
import { ChildAccessService } from '../../src/modules/child-profile/application/use-cases/child-access.service.js';
import { ChildProfileService } from '../../src/modules/child-profile/application/use-cases/child-profile.service.js';
import { MembersService } from '../../src/modules/child-profile/application/use-cases/members.service.js';
import {
  FixedClock,
  ImmediateUnitOfWork,
  RecordingEventBus,
  SequenceIds,
  type Snapshotable,
} from './kernel.js';

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

interface MemberRow extends NewMember {
  name: string | null;
  email: string;
  active: boolean;
}

/** Members and the users behind them, like the child_members table joined to users. */
export class InMemoryMembers implements MembershipRepository, Snapshotable {
  rows: MemberRow[] = [];
  readonly users = new Map<string, { email: string; name: string | null; active: boolean }>();
  childNames = new Map<string, string>();

  user(id: string) {
    return this.users.get(id) ?? { email: `${id}@example.vn`, name: null, active: true };
  }
  async roleOf(childId: string, userId: string) {
    return this.rows.find((r) => r.childId === childId && r.userId === userId)?.role ?? null;
  }
  async rolesOf(userId: string) {
    return new Map(this.rows.filter((r) => r.userId === userId).map((r) => [r.childId, r.role]));
  }
  private active(childId: string) {
    return this.rows.filter((r) => r.childId === childId && this.user(r.userId).active);
  }
  async list(childId: string) {
    return this.active(childId)
      .sort((a, b) => (a.role === b.role ? +a.joinedAt - +b.joinedAt : a.role === 'owner' ? -1 : 1))
      .map((r) => ({
        userId: r.userId,
        displayName: displayName(this.user(r.userId).name, this.user(r.userId).email),
        email: this.user(r.userId).email,
        role: r.role,
        joinedAt: r.joinedAt,
      }));
  }
  async count(childId: string) {
    return this.active(childId).length;
  }
  async add(member: NewMember) {
    if (this.rows.some((r) => r.childId === member.childId && r.userId === member.userId)) {
      throw new AlreadyMemberError(member.childId);
    }
    const u = this.user(member.userId);
    this.rows.push({ ...member, name: u.name, email: u.email, active: u.active });
  }
  async remove(childId: string, userId: string) {
    const before = this.rows.length;
    this.rows = this.rows.filter(
      (r) => !(r.childId === childId && r.userId === userId && r.role === 'caregiver'),
    );
    return this.rows.length < before;
  }
  async transferOwnership(childId: string, from: string, to: string) {
    for (const r of this.rows) {
      if (r.childId !== childId) continue;
      if (r.userId === from) r.role = 'caregiver';
      if (r.userId === to) r.role = 'owner';
    }
  }
  async displayNameOf(userId: string) {
    return displayName(this.user(userId).name, this.user(userId).email);
  }
  async ownedWithOthers(userId: string) {
    const owned = this.rows.filter((r) => r.userId === userId && r.role === 'owner');
    return owned
      .filter((o) => this.active(o.childId).some((r) => r.userId !== userId))
      .map((o) => ({ id: o.childId, name: this.childNames.get(o.childId) ?? o.childId }));
  }
  async leaveAllAsCaregiver(userId: string) {
    this.rows = this.rows.filter((r) => !(r.userId === userId && r.role === 'caregiver'));
  }
  snapshot() {
    return this.rows.map((r) => ({ ...r }));
  }
  restore(state: unknown) {
    this.rows = state as MemberRow[];
  }
  /** Test helper. */
  join(childId: string, userId: string, role: MemberRole = 'caregiver') {
    this.rows.push({
      childId,
      userId,
      role,
      invitedBy: null,
      joinedAt: new Date('2026-09-24T02:00:00Z'),
      name: null,
      email: this.user(userId).email,
      active: true,
    });
  }
}

export class InMemoryChildren implements ChildRepository {
  readonly rows = new Map<string, Child>();
  constructor(private readonly members = new InMemoryMembers()) {}
  private isMember(childId: string, userId: string) {
    return this.members.rows.some((r) => r.childId === childId && r.userId === userId);
  }
  async create(child: Child) {
    this.rows.set(child.id, copy(child));
    this.members.childNames.set(child.id, child.name);
    this.members.join(child.id, child.userId, 'owner');
  }
  async findById(childId: string) {
    const child = this.rows.get(childId);
    return child ? copy(child) : null;
  }
  async findOwned(childId: string, userId: string) {
    const child = this.rows.get(childId);
    return child && this.isMember(childId, userId) ? copy(child) : null;
  }
  async listOwned(userId: string) {
    return [...this.rows.values()]
      .filter((c) => this.isMember(c.id, userId))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(copy);
  }
  async save(child: Child) {
    this.rows.set(child.id, copy(child));
  }
  async deleteOwned(childId: string, userId: string) {
    if (!this.rows.has(childId) || !this.isMember(childId, userId)) return false;
    this.rows.delete(childId);
    this.members.rows = this.members.rows.filter((r) => r.childId !== childId);
    return true;
  }
}

const copyInvite = (i: ChildInvite) =>
  ChildInvite.restore({
    id: i.id,
    childId: i.childId,
    tokenHash: i.tokenHash,
    createdBy: i.createdBy,
    createdAt: i.createdAt,
    expiresAt: i.expiresAt,
    acceptedBy: i.acceptedBy,
    acceptedAt: i.acceptedAt,
    revokedAt: i.revokedAt,
  });

export class InMemoryInvites implements InviteRepository, Snapshotable {
  rows: ChildInvite[] = [];
  async add(invite: ChildInvite) {
    this.rows.push(copyInvite(invite));
  }
  async findByTokenHash(hash: string) {
    const found = this.rows.find((i) => i.tokenHash === hash);
    return found ? copyInvite(found) : null;
  }
  async find(childId: string, id: string) {
    const found = this.rows.find((i) => i.id === id && i.childId === childId);
    return found ? copyInvite(found) : null;
  }
  async listPending(childId: string, now: Date) {
    return this.rows
      .filter((i) => i.childId === childId && i.status(now) === 'pending')
      .map(copyInvite);
  }
  async markAccepted(invite: ChildInvite) {
    const stored = this.rows.find((i) => i.id === invite.id)!;
    if (stored.acceptedAt || stored.revokedAt) return false;
    this.rows = this.rows.map((i) => (i.id === invite.id ? copyInvite(invite) : i));
    return true;
  }
  async saveRevoked(invite: ChildInvite) {
    this.rows = this.rows.map((i) => (i.id === invite.id ? copyInvite(invite) : i));
  }
  async revokeAllBy(userId: string, now: Date) {
    for (const invite of this.rows) {
      if (invite.createdBy === userId && !invite.acceptedAt && !invite.revokedAt)
        invite.revoke(now);
    }
  }
  snapshot() {
    return this.rows.map(copyInvite);
  }
  restore(state: unknown) {
    this.rows = state as ChildInvite[];
  }
}

/** Predictable tokens: "token-1", "token-2"…; the hash is visible in tests. */
export class FakeInviteTokens implements InviteTokens {
  private n = 0;
  create() {
    this.n += 1;
    const token = `token-${this.n}`;
    return { token, hash: this.hash(token) };
  }
  hash(token: string) {
    return `hash(${token})`;
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
  const members = new InMemoryMembers();
  const children = new InMemoryChildren(members);
  const invites = new InMemoryInvites();
  const tokens = new FakeInviteTokens();
  const ingredients = new FakeIngredients();
  const events = new RecordingEventBus();
  const uow = new ImmediateUnitOfWork().track(members, invites);
  const access = new ChildAccessService(members);
  const service = new ChildProfileService(children, ingredients, ids, clock, events, access);
  const membership = new MembersService(
    access,
    members,
    invites,
    children,
    tokens,
    { webBaseUrl: 'https://thucdon.test' },
    ids,
    clock,
    uow,
  );
  return {
    clock,
    ids,
    children,
    members,
    invites,
    tokens,
    ingredients,
    events,
    uow,
    access,
    service,
    membership,
  };
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
