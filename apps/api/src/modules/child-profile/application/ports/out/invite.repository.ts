import type { ChildInvite } from '../../../domain/invite.js';

export const INVITE_REPOSITORY = Symbol('INVITE_REPOSITORY');

export interface InviteRepository {
  add(invite: ChildInvite): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<ChildInvite | null>;
  find(childId: string, inviteId: string): Promise<ChildInvite | null>;
  /** Not used, not revoked, not expired at `now`. */
  listPending(childId: string, now: Date): Promise<ChildInvite[]>;
  /** Conditional: false when someone else used or revoked the link first (TC-FAM-007). */
  markAccepted(invite: ChildInvite): Promise<boolean>;
  saveRevoked(invite: ChildInvite): Promise<void>;
}
