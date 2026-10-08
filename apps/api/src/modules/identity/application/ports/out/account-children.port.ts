export const ACCOUNT_CHILDREN = Symbol('ACCOUNT_CHILDREN');

/** What closing an account means for the children the user cares for (BR-76). */
export interface AccountChildren {
  /** Children the user owns that other members still use. */
  blockingDeletion(userId: string): Promise<{ id: string; name: string }[]>;
  /** A caregiver stops being a member everywhere. */
  leaveAll(userId: string): Promise<void>;
}
