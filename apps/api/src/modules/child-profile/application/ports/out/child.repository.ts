import type { Child } from '../../../domain/child.js';

export const CHILD_REPOSITORY = Symbol('CHILD_REPOSITORY');

/**
 * Reads are scoped to the members of the child: another family's child is simply not found.
 * What a member may change is decided by the use cases (BR-73).
 */
export interface ChildRepository {
  /** Also makes the creator the owner (BR-70). */
  create(child: Child): Promise<void>;
  /** Unscoped: only for showing the child's name on an invite (G14). */
  findById(childId: string): Promise<Child | null>;
  findOwned(childId: string, userId: string): Promise<Child | null>;
  listOwned(userId: string): Promise<Child[]>;
  save(child: Child): Promise<void>;
  deleteOwned(childId: string, userId: string): Promise<boolean>;
}
