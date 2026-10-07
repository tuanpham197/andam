export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');

/** Runs `work` atomically: every repository call inside commits or rolls back together. */
export interface UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>;
}
