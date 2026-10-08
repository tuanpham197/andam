import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../shared/kernel/clock.port.js';
import { ID_GENERATOR, type IdGenerator } from '../../../../shared/kernel/id-generator.port.js';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/kernel/unit-of-work.port.js';
import {
  AlreadyMemberError,
  InviteLimitError,
  InviteNotFoundError,
  InviteUsedError,
  MemberLimitError,
  MemberNotFoundError,
  NotACaregiverError,
} from '../../domain/errors.js';
import { ChildInvite } from '../../domain/invite.js';
import { MAX_MEMBERS, MAX_PENDING_INVITES, type MemberRole } from '../../domain/membership.js';
import { CHILD_REPOSITORY, type ChildRepository } from '../ports/out/child.repository.js';
import { INVITE_REPOSITORY, type InviteRepository } from '../ports/out/invite.repository.js';
import {
  INVITE_SETTINGS,
  INVITE_TOKENS,
  type InviteSettings,
  type InviteTokens,
} from '../ports/out/invite-tokens.port.js';
import {
  MEMBERSHIP_REPOSITORY,
  type MemberView,
  type MembershipRepository,
} from '../ports/out/membership.repository.js';
import { ChildAccessService } from './child-access.service.js';

export interface MembersView {
  members: (MemberView & { isMe: boolean })[];
  /** Only the owner sees them (FR-113). */
  pendingInvites: { id: string; createdAt: Date; expiresAt: Date }[];
}

export interface CreatedInvite {
  id: string;
  /** Holds the token: shown once, never stored (BR-72). */
  url: string;
  expiresAt: Date;
}

/** UC-20..22: invites, members, leaving and handing over a child (BR-70..79). */
@Injectable()
export class MembersService {
  constructor(
    @Inject(ChildAccessService) private readonly access: ChildAccessService,
    @Inject(MEMBERSHIP_REPOSITORY) private readonly members: MembershipRepository,
    @Inject(INVITE_REPOSITORY) private readonly invites: InviteRepository,
    @Inject(CHILD_REPOSITORY) private readonly children: ChildRepository,
    @Inject(INVITE_TOKENS) private readonly tokens: InviteTokens,
    @Inject(INVITE_SETTINGS) private readonly settings: InviteSettings,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  async list(userId: string, childId: string): Promise<MembersView> {
    const role = await this.access.require(userId, childId, 'view');
    const members = await this.members.list(childId);
    const pending =
      role === 'owner' ? await this.invites.listPending(childId, this.clock.now()) : [];
    return {
      members: members.map((m) => ({ ...m, isMe: m.userId === userId })),
      pendingInvites: pending.map((i) => ({
        id: i.id,
        createdAt: i.createdAt,
        expiresAt: i.expiresAt,
      })),
    };
  }

  async createInvite(userId: string, childId: string): Promise<CreatedInvite> {
    await this.access.require(userId, childId, 'manage_members');
    const now = this.clock.now();
    if ((await this.members.count(childId)) >= MAX_MEMBERS) throw new MemberLimitError();
    if ((await this.invites.listPending(childId, now)).length >= MAX_PENDING_INVITES) {
      throw new InviteLimitError();
    }
    const { token, hash } = this.tokens.create();
    const invite = ChildInvite.issue({
      id: this.ids.next(),
      childId,
      tokenHash: hash,
      createdBy: userId,
      now,
    });
    await this.invites.add(invite);
    return {
      id: invite.id,
      url: `${this.settings.webBaseUrl}/invite/${token}`,
      expiresAt: invite.expiresAt,
    };
  }

  async revokeInvite(userId: string, childId: string, inviteId: string): Promise<void> {
    await this.access.require(userId, childId, 'manage_members');
    const invite = await this.invites.find(childId, inviteId);
    if (!invite) throw new InviteNotFoundError();
    invite.revoke(this.clock.now());
    await this.invites.saveRevoked(invite);
  }

  private async byToken(token: string): Promise<ChildInvite> {
    const invite = await this.invites.findByTokenHash(this.tokens.hash(token));
    if (!invite) throw new InviteNotFoundError();
    return invite;
  }

  /** FR-111, public: only what the recipient needs to decide (TC-FAM-003). */
  async preview(
    token: string,
  ): Promise<{ childName: string; inviterName: string; expiresAt: Date }> {
    const invite = await this.byToken(token);
    invite.assertUsable(this.clock.now());
    const [child, inviterName] = await Promise.all([
      this.children.findById(invite.childId),
      this.members.displayNameOf(invite.createdBy),
    ]);
    return { childName: child!.name, inviterName, expiresAt: invite.expiresAt };
  }

  async accept(userId: string, token: string): Promise<{ childId: string; role: MemberRole }> {
    return this.uow.run(async () => {
      const invite = await this.byToken(token);
      if (await this.members.roleOf(invite.childId, userId)) {
        throw new AlreadyMemberError(invite.childId);
      }
      const now = this.clock.now();
      invite.accept(userId, now);
      if ((await this.members.count(invite.childId)) >= MAX_MEMBERS) throw new MemberLimitError();
      // Two people pressing "Tham gia" on one link: the conditional update lets only one through.
      if (!(await this.invites.markAccepted(invite))) throw new InviteUsedError();
      await this.members.add({
        childId: invite.childId,
        userId,
        role: 'caregiver',
        invitedBy: invite.createdBy,
        joinedAt: now,
      });
      return { childId: invite.childId, role: 'caregiver' as const };
    });
  }

  /** The owner removes a caregiver; a caregiver removing themselves leaves (FR-114/115). */
  async remove(userId: string, childId: string, memberId: string): Promise<void> {
    if (memberId === userId) {
      await this.access.require(userId, childId, 'leave');
    } else {
      await this.access.require(userId, childId, 'manage_members');
    }
    if (!(await this.members.remove(childId, memberId))) throw new MemberNotFoundError();
  }

  async transferOwnership(userId: string, childId: string, toUserId: string): Promise<void> {
    await this.access.require(userId, childId, 'manage_members');
    if ((await this.members.roleOf(childId, toUserId)) !== 'caregiver') {
      throw new NotACaregiverError();
    }
    await this.uow.run(() => this.members.transferOwnership(childId, userId, toUserId));
  }

  /** BR-76, for account deletion. */
  blockingAccountDeletion(userId: string): Promise<{ id: string; name: string }[]> {
    return this.members.ownedWithOthers(userId);
  }

  leaveAllAsCaregiver(userId: string): Promise<void> {
    return this.members.leaveAllAsCaregiver(userId);
  }
}
