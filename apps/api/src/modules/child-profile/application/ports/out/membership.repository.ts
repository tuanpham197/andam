import type { MemberRole } from '../../../domain/membership.js';

export const MEMBERSHIP_REPOSITORY = Symbol('MEMBERSHIP_REPOSITORY');

export interface MemberView {
  userId: string;
  displayName: string;
  email: string;
  role: MemberRole;
  joinedAt: Date;
}

export interface NewMember {
  childId: string;
  userId: string;
  role: MemberRole;
  invitedBy: string | null;
  joinedAt: Date;
}

/** Who belongs to which child (BR-70..76). */
export interface MembershipRepository {
  roleOf(childId: string, userId: string): Promise<MemberRole | null>;
  /** Every child the user belongs to, with the user's role there. */
  rolesOf(userId: string): Promise<Map<string, MemberRole>>;
  /** Members with an active account, owner first. */
  list(childId: string): Promise<MemberView[]>;
  count(childId: string): Promise<number>;
  add(member: NewMember): Promise<void>;
  remove(childId: string, userId: string): Promise<boolean>;
  /** Swaps the two roles and points the child at its new owner, in one go. */
  transferOwnership(childId: string, from: string, to: string): Promise<void>;
  displayNameOf(userId: string): Promise<string>;
  /** BR-76: children the user owns that other members still use. */
  ownedWithOthers(userId: string): Promise<{ id: string; name: string }[]>;
  /** BR-76: a caregiver closing the account simply stops being a member. */
  leaveAllAsCaregiver(userId: string): Promise<void>;
}
