import type { User } from '../../../domain/user.js';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface ConsentRecord {
  id: string;
  version: string;
  acceptedAt: Date;
  ip: string | null;
}

export interface UserRepository {
  /** Includes soft-deleted users: their e-mail stays reserved until hard deletion. */
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  /** Throws EmailTakenError when the e-mail already exists (unique index race, TC-AUTH-002). */
  create(user: User, consent: ConsentRecord): Promise<void>;
  save(user: User): Promise<void>;
  /**
   * Erases accounts closed before `cutoff`, with what only they could see (UC-19): sessions,
   * consents, children nobody else cares for. Records they wrote on a shared child stay,
   * without their name (BR-80). Returns how many accounts were erased.
   */
  purgeDeletedBefore(cutoff: Date): Promise<number>;
}
