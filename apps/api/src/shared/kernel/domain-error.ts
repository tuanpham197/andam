/**
 * How a business error should be understood by callers. Adapters translate the kind into
 * transport details (HTTP status, ...) so the domain never knows about HTTP.
 */
export type DomainErrorKind =
  | 'invalid_input'
  | 'not_found'
  | 'conflict'
  | 'rule_violation'
  | 'unauthenticated'
  | 'too_many_requests';

export abstract class DomainError extends Error {
  /** Stable, machine-readable identifier exposed to clients (e.g. `CHILD_TOO_YOUNG`). */
  abstract readonly code: string;
  abstract readonly kind: DomainErrorKind;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
