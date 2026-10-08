export const CHILD_OWNERSHIP = Symbol('CHILD_OWNERSHIP');

export interface ChildOwnership {
  /** The child's name when it belongs to `userId`, else null. */
  nameOf(childId: string, userId: string): Promise<string | null>;
}
