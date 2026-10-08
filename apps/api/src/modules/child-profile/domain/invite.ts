import { InviteExpiredError, InviteRevokedError, InviteUsedError } from './errors.js';

/** BR-72: an invite link lasts 72 hours. */
export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

interface ChildInviteState {
  id: string;
  childId: string;
  tokenHash: string;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date;
  acceptedBy: string | null;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

/** A single-use link to join a child as a caregiver (UC-20/21). Only the token hash is kept. */
export class ChildInvite {
  private constructor(private readonly state: ChildInviteState) {}

  static issue(input: {
    id: string;
    childId: string;
    tokenHash: string;
    createdBy: string;
    now: Date;
  }): ChildInvite {
    return new ChildInvite({
      id: input.id,
      childId: input.childId,
      tokenHash: input.tokenHash,
      createdBy: input.createdBy,
      createdAt: input.now,
      expiresAt: new Date(input.now.getTime() + INVITE_TTL_MS),
      acceptedBy: null,
      acceptedAt: null,
      revokedAt: null,
    });
  }

  static restore(state: ChildInviteState): ChildInvite {
    return new ChildInvite({ ...state });
  }

  get id() {
    return this.state.id;
  }
  get childId() {
    return this.state.childId;
  }
  get tokenHash() {
    return this.state.tokenHash;
  }
  get createdBy() {
    return this.state.createdBy;
  }
  get createdAt() {
    return this.state.createdAt;
  }
  get expiresAt() {
    return this.state.expiresAt;
  }
  get acceptedBy() {
    return this.state.acceptedBy;
  }
  get acceptedAt() {
    return this.state.acceptedAt;
  }
  get revokedAt() {
    return this.state.revokedAt;
  }

  /** Used and revoked win over expired: the parent learns what really happened to the link. */
  status(now: Date): InviteStatus {
    if (this.state.acceptedAt) return 'accepted';
    if (this.state.revokedAt) return 'revoked';
    return now.getTime() >= this.state.expiresAt.getTime() ? 'expired' : 'pending';
  }

  /** Throws unless the link can still be used (TC-FAM-004..006). */
  assertUsable(now: Date): void {
    const status = this.status(now);
    if (status === 'accepted') throw new InviteUsedError();
    if (status === 'revoked') throw new InviteRevokedError();
    if (status === 'expired') throw new InviteExpiredError();
  }

  accept(userId: string, now: Date): void {
    this.assertUsable(now);
    this.state.acceptedBy = userId;
    this.state.acceptedAt = now;
  }

  /** Revoking twice changes nothing; a link already used cannot be taken back. */
  revoke(now: Date): void {
    if (this.state.acceptedAt) throw new InviteUsedError();
    this.state.revokedAt ??= now;
  }
}
