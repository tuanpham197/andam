import type { Email } from './email.js';

export const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

interface UserState {
  id: string;
  email: Email;
  passwordHash: string;
  timezone: string;
  createdAt: Date;
  deletedAt: Date | null;
}

export class User {
  private constructor(private state: UserState) {}

  static register(input: { id: string; email: Email; passwordHash: string; now: Date }): User {
    return new User({
      id: input.id,
      email: input.email,
      passwordHash: input.passwordHash,
      timezone: DEFAULT_TIMEZONE,
      createdAt: input.now,
      deletedAt: null,
    });
  }

  static restore(state: UserState): User {
    return new User({ ...state });
  }

  get id() {
    return this.state.id;
  }
  get email() {
    return this.state.email;
  }
  get passwordHash() {
    return this.state.passwordHash;
  }
  get timezone() {
    return this.state.timezone;
  }
  get createdAt() {
    return this.state.createdAt;
  }
  get deletedAt() {
    return this.state.deletedAt;
  }
  get isActive() {
    return this.state.deletedAt === null;
  }

  changePassword(passwordHash: string): void {
    this.state.passwordHash = passwordHash;
  }

  /** Soft delete: access stops now, hard deletion follows within 30 days (UC-19). */
  delete(now: Date): void {
    this.state.deletedAt ??= now;
  }
}
