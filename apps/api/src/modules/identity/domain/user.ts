import type { Email } from './email.js';
import { InvalidDisplayNameError } from './errors.js';

export const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

interface UserState {
  id: string;
  email: Email;
  passwordHash: string;
  timezone: string;
  /** Shown to the other members of a child (FR-119); null falls back to the e-mail name. */
  displayName: string | null;
  createdAt: Date;
  deletedAt: Date | null;
}

const DISPLAY_NAME_MAX = 30;

/** UC-19: a closed account is erased for good this long after it was closed. */
export const HARD_DELETE_AFTER_DAYS = 30;
const graphemes = new Intl.Segmenter('vi', { granularity: 'grapheme' });

export class User {
  private constructor(private state: UserState) {}

  static register(input: { id: string; email: Email; passwordHash: string; now: Date }): User {
    return new User({
      id: input.id,
      email: input.email,
      passwordHash: input.passwordHash,
      timezone: DEFAULT_TIMEZONE,
      displayName: null,
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
  get displayName() {
    return this.state.displayName;
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

  /** NFC, trimmed, inner spaces collapsed; empty clears it; at most 30 characters (TC-FAM-025). */
  rename(displayName: string | null): void {
    const name = (displayName ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
    if ([...graphemes.segment(name)].length > DISPLAY_NAME_MAX) throw new InvalidDisplayNameError();
    this.state.displayName = name === '' ? null : name;
  }

  changePassword(passwordHash: string): void {
    this.state.passwordHash = passwordHash;
  }

  /** Soft delete: access stops now, hard deletion follows after 30 days (UC-19). */
  delete(now: Date): void {
    this.state.deletedAt ??= now;
  }
}
