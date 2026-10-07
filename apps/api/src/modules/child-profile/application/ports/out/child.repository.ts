import type { Child } from '../../../domain/child.js';

export const CHILD_REPOSITORY = Symbol('CHILD_REPOSITORY');

/** Every read and write is scoped to the owner: another user's child is simply not found. */
export interface ChildRepository {
  create(child: Child): Promise<void>;
  findOwned(childId: string, userId: string): Promise<Child | null>;
  listOwned(userId: string): Promise<Child[]>;
  save(child: Child): Promise<void>;
  deleteOwned(childId: string, userId: string): Promise<boolean>;
}
