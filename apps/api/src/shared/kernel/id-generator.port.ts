export const ID_GENERATOR = Symbol('ID_GENERATOR');

export interface IdGenerator {
  /** A new UUID for an aggregate or record. */
  next(): string;
}
