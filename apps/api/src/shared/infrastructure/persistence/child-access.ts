import type { Prisma } from '../../../generated/prisma/client.js';

/**
 * The children a user may see: those the user is a member of (owner or caregiver, BR-73).
 * Every Prisma adapter filters through this (second line of defence after the use case checks).
 */
export const childrenOf = (userId: string): Prisma.ChildWhereInput => ({
  members: { some: { userId } },
});
