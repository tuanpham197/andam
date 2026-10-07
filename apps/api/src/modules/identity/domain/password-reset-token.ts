export const PASSWORD_RESET_TTL_MS = 30 * 60_000;

interface PasswordResetTokenState {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

export class PasswordResetToken {
  private constructor(private state: PasswordResetTokenState) {}

  static issue(input: { id: string; userId: string; tokenHash: string; now: Date }) {
    return new PasswordResetToken({
      id: input.id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: new Date(input.now.getTime() + PASSWORD_RESET_TTL_MS),
      usedAt: null,
    });
  }

  static restore(state: PasswordResetTokenState): PasswordResetToken {
    return new PasswordResetToken({ ...state });
  }

  get id() {
    return this.state.id;
  }
  get userId() {
    return this.state.userId;
  }
  get tokenHash() {
    return this.state.tokenHash;
  }
  get expiresAt() {
    return this.state.expiresAt;
  }
  get usedAt() {
    return this.state.usedAt;
  }

  isUsable(now: Date): boolean {
    return this.state.usedAt === null && now.getTime() <= this.state.expiresAt.getTime();
  }

  markUsed(now: Date): void {
    this.state.usedAt = now;
  }
}
