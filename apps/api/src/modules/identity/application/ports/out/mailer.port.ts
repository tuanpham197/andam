export const MAILER = Symbol('MAILER');

export interface Mailer {
  sendPasswordReset(input: { to: string; resetUrl: string }): Promise<void>;
}
