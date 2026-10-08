import { childProfileTestbed, NA } from '../../../../../test/fakes/child-profile.js';
import {
  AlreadyMemberError,
  ChildNotFoundError,
  InviteExpiredError,
  InviteLimitError,
  InviteNotFoundError,
  InviteRevokedError,
  InviteUsedError,
  MemberLimitError,
  MemberNotFoundError,
  NotACaregiverError,
  OwnerCannotLeaveError,
  OwnerOnlyError,
} from '../../domain/errors.js';
import { INVITE_TTL_MS } from '../../domain/invite.js';

const MOM = 'mom';
const DAD = 'dad';

async function family() {
  const t = childProfileTestbed();
  t.members.users.set(MOM, { email: 'me.na@example.vn', name: 'Mẹ Na', active: true });
  t.members.users.set(DAD, { email: 'ba.na@example.vn', name: null, active: true });
  const child = await t.service.create(MOM, NA);
  const tokenOf = (url: string) => url.split('/invite/')[1]!;
  return { ...t, childId: child.id, tokenOf };
}

describe('MembersService invites (UC-20/21)', () => {
  it('TC-FAM-001 the owner creates a link; the parent who opens it joins as caregiver', async () => {
    const t = await family();
    const invite = await t.membership.createInvite(MOM, t.childId);
    expect(invite).toEqual({
      id: expect.any(String),
      url: 'https://thucdon.test/invite/token-1',
      expiresAt: new Date(t.clock.now().getTime() + INVITE_TTL_MS),
    });
    expect(t.invites.rows[0]!.tokenHash).toBe('hash(token-1)');

    expect(await t.membership.preview('token-1')).toEqual({
      childName: 'Na',
      inviterName: 'Mẹ Na',
      expiresAt: invite.expiresAt,
    });
    expect(await t.membership.accept(DAD, 'token-1')).toEqual({
      childId: t.childId,
      role: 'caregiver',
    });
    const view = await t.service.list(DAD);
    expect(view.map((c) => [c.id, c.role])).toEqual([[t.childId, 'caregiver']]);
    expect(t.members.rows.find((r) => r.userId === DAD)).toMatchObject({ invitedBy: MOM });
  });

  it('TC-FAM-004/006 refuses an expired, revoked or unknown link, also in the preview', async () => {
    const t = await family();
    await t.membership.createInvite(MOM, t.childId);
    const second = await t.membership.createInvite(MOM, t.childId);
    await t.membership.revokeInvite(MOM, t.childId, second.id);
    await expect(t.membership.preview('token-2')).rejects.toThrow(InviteRevokedError);
    await expect(t.membership.accept(DAD, 'token-2')).rejects.toThrow(InviteRevokedError);
    await expect(t.membership.preview('nope')).rejects.toThrow(InviteNotFoundError);
    await expect(t.membership.accept(DAD, 'nope')).rejects.toThrow(InviteNotFoundError);
    t.clock.advance(INVITE_TTL_MS);
    await expect(t.membership.preview('token-1')).rejects.toThrow(InviteExpiredError);
    await expect(t.membership.accept(DAD, 'token-1')).rejects.toThrow(InviteExpiredError);
  });

  it('TC-FAM-005 a used link cannot be used again', async () => {
    const t = await family();
    await t.membership.createInvite(MOM, t.childId);
    await t.membership.accept(DAD, 'token-1');
    await expect(t.membership.accept('grandma', 'token-1')).rejects.toThrow(InviteUsedError);
  });

  it('TC-FAM-007 when someone else used the link a moment before, nothing is added', async () => {
    const t = await family();
    await t.membership.createInvite(MOM, t.childId);
    // The other request accepted between our read and our write.
    const markAccepted = t.invites.markAccepted.bind(t.invites);
    t.invites.markAccepted = async (invite) => {
      await markAccepted(invite);
      return false;
    };
    await expect(t.membership.accept(DAD, 'token-1')).rejects.toThrow(InviteUsedError);
    expect(await t.access.roleOf(DAD, t.childId)).toBeNull();
  });

  it('TC-FAM-008 a member opening a link of the same child is told, with the child to open', async () => {
    const t = await family();
    await t.membership.createInvite(MOM, t.childId);
    const error = await t.membership.accept(MOM, 'token-1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AlreadyMemberError);
    expect((error as AlreadyMemberError).childId).toBe(t.childId);
  });

  it('TC-FAM-009 six members at most: no new invite, and a pending one cannot fill a 7th seat', async () => {
    const t = await family();
    await t.membership.createInvite(MOM, t.childId);
    for (const id of ['c1', 'c2', 'c3', 'c4']) t.members.join(t.childId, id);
    await t.membership.accept('c5', 'token-1');
    await expect(t.membership.createInvite(MOM, t.childId)).rejects.toThrow(MemberLimitError);

    const t2 = await family();
    await t2.membership.createInvite(MOM, t2.childId);
    for (const id of ['c1', 'c2', 'c3', 'c4', 'c5']) t2.members.join(t2.childId, id);
    await expect(t2.membership.accept(DAD, 'token-1')).rejects.toThrow(MemberLimitError);
  });

  it('a deleted account does not take a seat', async () => {
    const t = await family();
    for (const id of ['c1', 'c2', 'c3', 'c4', 'c5']) t.members.join(t.childId, id);
    t.members.users.set('c5', { email: 'c5@example.vn', name: null, active: false });
    await expect(t.membership.createInvite(MOM, t.childId)).resolves.toBeDefined();
  });

  it('TC-FAM-010 five pending links at most; revoking one frees a slot', async () => {
    const t = await family();
    const links = [];
    for (let i = 0; i < 5; i += 1) links.push(await t.membership.createInvite(MOM, t.childId));
    await expect(t.membership.createInvite(MOM, t.childId)).rejects.toThrow(InviteLimitError);
    await t.membership.revokeInvite(MOM, t.childId, links[0]!.id);
    await expect(t.membership.createInvite(MOM, t.childId)).resolves.toBeDefined();
  });

  it('TC-FAM-012 a caregiver or a stranger cannot invite nor revoke', async () => {
    const t = await family();
    t.members.join(t.childId, DAD);
    await expect(t.membership.createInvite(DAD, t.childId)).rejects.toThrow(OwnerOnlyError);
    await expect(t.membership.createInvite('x', t.childId)).rejects.toThrow(ChildNotFoundError);
    const link = await t.membership.createInvite(MOM, t.childId);
    await expect(t.membership.revokeInvite(DAD, t.childId, link.id)).rejects.toThrow(
      OwnerOnlyError,
    );
    await expect(t.membership.revokeInvite(MOM, t.childId, 'nope')).rejects.toThrow(
      InviteNotFoundError,
    );
  });
});

describe('MembersService members (UC-22)', () => {
  it('TC-FAM-013 lists members, owner first; only the owner sees pending links', async () => {
    const t = await family();
    t.members.join(t.childId, DAD);
    await t.membership.createInvite(MOM, t.childId);
    const forMom = await t.membership.list(MOM, t.childId);
    expect(forMom.members.map((m) => [m.displayName, m.role, m.isMe])).toEqual([
      ['Mẹ Na', 'owner', true],
      ['ba.na', 'caregiver', false],
    ]);
    expect(forMom.pendingInvites).toHaveLength(1);
    expect((await t.membership.list(DAD, t.childId)).pendingInvites).toEqual([]);
    await expect(t.membership.list('x', t.childId)).rejects.toThrow(ChildNotFoundError);
  });

  it('FR-114 the owner removes a caregiver; removing a stranger finds nobody', async () => {
    const t = await family();
    t.members.join(t.childId, DAD);
    await t.membership.remove(MOM, t.childId, DAD);
    expect(await t.access.roleOf(DAD, t.childId)).toBeNull();
    await expect(t.membership.remove(MOM, t.childId, DAD)).rejects.toThrow(MemberNotFoundError);
  });

  it('TC-FAM-015 a caregiver leaves; the owner cannot leave; a caregiver cannot remove others', async () => {
    const t = await family();
    t.members.join(t.childId, DAD);
    t.members.join(t.childId, 'grandma');
    await expect(t.membership.remove(DAD, t.childId, 'grandma')).rejects.toThrow(OwnerOnlyError);
    await expect(t.membership.remove(MOM, t.childId, MOM)).rejects.toThrow(OwnerCannotLeaveError);
    await t.membership.remove(DAD, t.childId, DAD);
    expect(await t.access.roleOf(DAD, t.childId)).toBeNull();
  });

  it('TC-FAM-016 hands the child over to a caregiver, never to an outsider or oneself', async () => {
    const t = await family();
    t.members.join(t.childId, DAD);
    await expect(t.membership.transferOwnership(MOM, t.childId, 'x')).rejects.toThrow(
      NotACaregiverError,
    );
    await expect(t.membership.transferOwnership(MOM, t.childId, MOM)).rejects.toThrow(
      NotACaregiverError,
    );
    await t.membership.transferOwnership(MOM, t.childId, DAD);
    expect(await t.access.roleOf(DAD, t.childId)).toBe('owner');
    expect(await t.access.roleOf(MOM, t.childId)).toBe('caregiver');
    await expect(t.membership.transferOwnership(MOM, t.childId, DAD)).rejects.toThrow(
      OwnerOnlyError,
    );
  });

  it('BR-76 names the children an owner must hand over, and lets a caregiver leave them all', async () => {
    const t = await family();
    const second = await t.service.create(MOM, { ...NA, name: 'Bin' });
    t.members.join(t.childId, DAD);
    expect(await t.membership.blockingAccountDeletion(MOM)).toEqual([
      { id: t.childId, name: 'Na' },
    ]);
    expect(await t.membership.blockingAccountDeletion(DAD)).toEqual([]);
    await t.membership.leaveAllAsCaregiver(DAD);
    expect(await t.membership.blockingAccountDeletion(MOM)).toEqual([]);
    expect(second.role).toBe('owner');
  });

  it('TC-FAM-029 closing the account revokes the links the user shared, used ones stay', async () => {
    const t = await family();
    const used = await t.membership.createInvite(MOM, t.childId);
    await t.membership.createInvite(MOM, t.childId);
    await t.membership.accept(DAD, 'token-1');
    await t.membership.remove(MOM, t.childId, DAD);
    await t.membership.leaveAllAsCaregiver(MOM);
    await expect(t.membership.preview('token-2')).rejects.toThrow(InviteRevokedError);
    expect(t.invites.rows.find((i) => i.id === used.id)!.revokedAt).toBeNull();
  });
});

describe('ChildProfileService for caregivers (BR-73)', () => {
  it('TC-FAM-012 a caregiver sees the child but cannot edit it, its avoid list, nor delete it', async () => {
    const t = await family();
    t.members.join(t.childId, DAD);
    expect((await t.service.get(DAD, t.childId)).role).toBe('caregiver');
    await expect(t.service.update(DAD, t.childId, { name: 'Bin' })).rejects.toThrow(OwnerOnlyError);
    await expect(
      t.service.replaceAvoidList(DAD, t.childId, { allergens: [], ingredients: [] }),
    ).rejects.toThrow(OwnerOnlyError);
    await expect(t.service.remove(DAD, t.childId)).rejects.toThrow(OwnerOnlyError);
    expect((await t.service.get(MOM, t.childId)).name).toBe('Na');
  });
});
