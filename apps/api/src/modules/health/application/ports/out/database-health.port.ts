export const DATABASE_HEALTH = Symbol('DATABASE_HEALTH');

export interface DatabaseHealthPort {
  /** Resolves `true` when the database answers a trivial query. */
  ping(): Promise<boolean>;
}
