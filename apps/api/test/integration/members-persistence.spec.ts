import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  CHILD_REPOSITORY,
  type ChildRepository,
} from '../../src/modules/child-profile/application/ports/out/child.repository.js';
import {
  INVITE_REPOSITORY,
  type InviteRepository,
} from '../../src/modules/child-profile/application/ports/out/invite.repository.js';
import {
  INVITE_TOKENS,
  type InviteTokens,
} from '../../src/modules/child-profile/application/ports/out/invite-tokens.port.js';
import {
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
} from '../../src/modules/child-profile/application/ports/out/membership.repository.js';
import { ChildProfileModule } from '../../src/modules/child-profile/child-profile.module.js';
import { Child } from '../../src/modules/child-profile/domain/child.js';
import { AlreadyMemberError } from '../../src/modules/child-profile/domain/errors.js';
import { ChildInvite, INVITE_TTL_MS } from '../../src/modules/child-profile/domain/invite.js';
import { ConfigModule } from '../../src/shared/infrastructure/config/config.module.js';
import { KernelModule } from '../../src/shared/infrastructure/kernel/kernel.module.js';
import { PersistenceModule } from '../../src/shared/infrastructure/persistence/persistence.module.js';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service.js';
import { UNIT_OF_WORK, type UnitOfWork } from '../../src/shared/kernel/unit-of-work.port.js';
import { insertUser, resetDatabase } from '../support/database.js';

let moduleRef: TestingModule;
let prisma: PrismaService;
let children: ChildRepository;
let members: MembershipRepository;
let invites: InviteRepository;
let tokens: InviteTokens;
let uow: UnitOfWork;
let mom: string;
let dad: string;
let childId: string;

const NOW = new Date('2026-10-08T02:00:00Z');
const get = <T>(token: unknown) => moduleRef.get<T>(token as never, { strict: false });

async function createChild(owner: string, name = 'Na') {
  const child = Child.create(
    {
      id: randomUUID(),
      userId: owner,
      name,
      birthDate: '2026-01-12',
      isPremature: false,
      weeksEarly: 0,
      priorReaction: 'never',
      priorReactionNote: null,
      avoidAllergens: [],
      avoidIngredients: [],
    },
    '2026-10-08',
    NOW,
  );
  await children.create(child);
  return child.id;
}

const join = (userId: string, role: 'caregiver' | 'owner' = 'caregiver', joinedAt = NOW) =>
  members.add({ childId, userId, role, invitedBy: mom, joinedAt });

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    imports: [ConfigModule, KernelModule, PersistenceModule, ChildProfileModule],
  }).compile();
  await moduleRef.init();
  prisma = moduleRef.get(PrismaService);
  children = get(CHILD_REPOSITORY);
  members = get(MEMBERSHIP_REPOSITORY);
  invites = get(INVITE_REPOSITORY);
  tokens = get(INVITE_TOKENS);
  uow = get(UNIT_OF_WORK);
  await resetDatabase(prisma);
});

beforeEach(async () => {
  await prisma.child.deleteMany();
  await prisma.user.deleteMany();
  mom = (await insertUser(prisma, 'me.na@example.vn')).id;
  dad = (await insertUser(prisma, 'ba.na@example.vn')).id;
  await prisma.user.update({ where: { id: mom }, data: { displayName: 'Mẹ Na' } });
  childId = await createChild(mom);
});

afterAll(() => moduleRef.close());

describe('PrismaChildRepository with members (BR-70)', () => {
  it('makes the creator the owner, and lets members (only) read the child', async () => {
    expect(await members.roleOf(childId, mom)).toBe('owner');
    expect(await children.findOwned(childId, dad)).toBeNull();
    await join(dad);
    expect((await children.findOwned(childId, dad))!.name).toBe('Na');
    expect((await children.listOwned(dad)).map((c) => c.id)).toEqual([childId]);
    expect((await children.findById(childId))!.name).toBe('Na');
    expect(await children.findById(randomUUID())).toBeNull();
  });
});

describe('PrismaMembershipRepository', () => {
  it('lists active members, owner first, with their display name', async () => {
    const grandma = (await insertUser(prisma, 'ba.noi@example.vn')).id;
    await join(grandma, 'caregiver', new Date('2026-10-08T03:00:00Z'));
    await join(dad, 'caregiver', new Date('2026-10-08T02:30:00Z'));
    expect((await members.list(childId)).map((m) => [m.displayName, m.role])).toEqual([
      ['Mẹ Na', 'owner'],
      ['ba.na', 'caregiver'],
      ['ba.noi', 'caregiver'],
    ]);
    expect(await members.count(childId)).toBe(3);
    await prisma.user.update({ where: { id: grandma }, data: { deletedAt: NOW } });
    expect(await members.count(childId)).toBe(2);
    expect(await members.rolesOf(dad)).toEqual(new Map([[childId, 'caregiver']]));
    expect(await members.displayNameOf(dad)).toBe('ba.na');
  });

  it('refuses a second membership of the same person', async () => {
    await join(dad);
    await expect(join(dad)).rejects.toThrow(AlreadyMemberError);
  });

  it('surfaces other errors (a user that does not exist)', async () => {
    await expect(join(randomUUID())).rejects.toMatchObject({ code: 'P2003' });
  });

  it('removes caregivers only', async () => {
    await join(dad);
    expect(await members.remove(childId, mom)).toBe(false);
    expect(await members.remove(childId, dad)).toBe(true);
    expect(await members.remove(childId, dad)).toBe(false);
  });

  it('TC-FAM-016 swaps the roles and points the child at the new owner, in one transaction', async () => {
    await join(dad);
    await uow.run(() => members.transferOwnership(childId, mom, dad));
    expect(await members.roleOf(childId, dad)).toBe('owner');
    expect(await members.roleOf(childId, mom)).toBe('caregiver');
    expect((await prisma.child.findUniqueOrThrow({ where: { id: childId } })).userId).toBe(dad);
  });

  it('TC-FAM-017 the database itself refuses a second owner', async () => {
    const error = await join(dad, 'owner').catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(AlreadyMemberError);
    expect(error).toMatchObject({ code: 'P2002' });
  });

  it('BR-76 finds the children an owner shares, and removes a caregiver everywhere', async () => {
    const alone = await createChild(mom, 'Bin');
    await join(dad);
    expect(await members.ownedWithOthers(mom)).toEqual([{ id: childId, name: 'Na' }]);
    expect(await members.ownedWithOthers(dad)).toEqual([]);
    await members.leaveAllAsCaregiver(dad);
    expect(await members.roleOf(childId, dad)).toBeNull();
    expect(await members.ownedWithOthers(mom)).toEqual([]);
    expect(await members.roleOf(alone, mom)).toBe('owner');
  });

  it('a deleted account no longer blocks the owner', async () => {
    await join(dad);
    await prisma.user.update({ where: { id: dad }, data: { deletedAt: NOW } });
    expect(await members.ownedWithOthers(mom)).toEqual([]);
  });
});

describe('PrismaInviteRepository', () => {
  const issue = (now = NOW) => {
    const { hash } = tokens.create();
    return ChildInvite.issue({ id: randomUUID(), childId, tokenHash: hash, createdBy: mom, now });
  };

  it('finds an invite by its token hash or id, and lists the pending ones', async () => {
    const pending = issue();
    const expired = issue(new Date(NOW.getTime() - INVITE_TTL_MS));
    const revoked = issue();
    revoked.revoke(NOW);
    await Promise.all([pending, expired, revoked].map((i) => invites.add(i)));
    await invites.saveRevoked(revoked);
    expect(await invites.findByTokenHash(pending.tokenHash)).toEqual(pending);
    expect(await invites.findByTokenHash('nope')).toBeNull();
    expect(await invites.find(childId, pending.id)).toEqual(pending);
    expect(await invites.find(randomUUID(), pending.id)).toBeNull();
    expect((await invites.listPending(childId, NOW)).map((i) => i.id)).toEqual([pending.id]);
  });

  it('TC-FAM-007 accepts once: a second acceptance of the same link is refused', async () => {
    const invite = issue();
    await invites.add(invite);
    invite.accept(dad, NOW);
    expect(await invites.markAccepted(invite)).toBe(true);
    expect(await invites.markAccepted(invite)).toBe(false);
    expect(await invites.findByTokenHash(invite.tokenHash)).toMatchObject({ acceptedBy: dad });
  });

  it('TC-FAM-029 revokes only the pending links of the user closing the account', async () => {
    const pending = issue();
    const used = issue();
    const expired = issue(new Date(NOW.getTime() - INVITE_TTL_MS));
    await Promise.all([pending, used, expired].map((i) => invites.add(i)));
    used.accept(dad, NOW);
    await invites.markAccepted(used);
    const later = new Date(NOW.getTime() + 60_000);
    await invites.revokeAllBy(dad, later);
    expect((await invites.find(childId, pending.id))!.revokedAt).toBeNull();
    await invites.revokeAllBy(mom, later);
    expect((await invites.find(childId, pending.id))!.revokedAt).toEqual(later);
    expect((await invites.find(childId, expired.id))!.revokedAt).toEqual(later);
    expect((await invites.find(childId, used.id))!.revokedAt).toBeNull();
  });

  it('hashes tokens with SHA-256 and never stores the token itself', () => {
    const { token, hash } = tokens.create();
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokens.hash(token)).toBe(hash);
  });
});

describe('migration 20261008090000_child_members', () => {
  it('TC-FAM-022 gives every existing child its creator as the only owner', async () => {
    const other = await createChild(dad, 'Bin');
    await prisma.childMember.deleteMany();
    const sql = readFileSync(
      new URL(
        '../../prisma/migrations/20261008090000_child_members/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );
    const backfill = sql.slice(sql.indexOf('INSERT INTO "child_members"'));
    await prisma.$executeRawUnsafe(backfill);
    expect(await members.roleOf(childId, mom)).toBe('owner');
    expect(await members.roleOf(other, dad)).toBe('owner');
    expect(await members.roleOf(childId, dad)).toBeNull();
    expect(await prisma.childMember.count()).toBe(2);
  });
});
