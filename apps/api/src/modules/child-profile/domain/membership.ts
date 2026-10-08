import { OwnerCannotLeaveError, OwnerOnlyError } from './errors.js';

export type MemberRole = 'owner' | 'caregiver';

/** What a member may do with a child (BR-73). */
export type ChildAction =
  /** See the profile, menus, recipes, library, journal, health, members. */
  | 'view'
  /** Prepare, swap, plan the week, parents' own dishes. */
  | 'plan'
  /** Log meals and reactions, open "Dấu hiệu nguy hiểm", update health: whoever feeds the child. */
  | 'log'
  | 'resume_paused'
  | 'edit_profile'
  | 'manage_members'
  | 'delete_child'
  | 'leave';

const OWNER_ONLY: ReadonlySet<ChildAction> = new Set([
  'resume_paused',
  'edit_profile',
  'manage_members',
  'delete_child',
]);

/** BR-71 */
export const MAX_MEMBERS = 6;
export const MAX_PENDING_INVITES = 5;

/** The single permission table (BR-73); every check goes through it. */
export function can(role: MemberRole, action: ChildAction): boolean {
  if (action === 'leave') return role === 'caregiver';
  return role === 'owner' || !OWNER_ONLY.has(action);
}

export function assertCan(role: MemberRole, action: ChildAction): void {
  if (can(role, action)) return;
  throw action === 'leave' ? new OwnerCannotLeaveError() : new OwnerOnlyError();
}

/** What other members see: the chosen name, or the part of the e-mail before "@" (FR-119). */
export function displayName(name: string | null, email: string): string {
  return name ?? email.split('@')[0]!;
}
