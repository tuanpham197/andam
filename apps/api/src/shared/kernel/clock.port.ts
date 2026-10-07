export const CLOCK = Symbol('CLOCK');

/** Every "now" goes through this port so time-dependent rules are testable (NFR-009). */
export interface Clock {
  now(): Date;
}
