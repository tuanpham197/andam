import type { LoginAttempt } from '../../../domain/login-throttle.js';

export const LOGIN_ATTEMPT_REPOSITORY = Symbol('LOGIN_ATTEMPT_REPOSITORY');

export interface LoginAttemptRepository {
  record(email: string, attempt: LoginAttempt): Promise<void>;
  since(email: string, from: Date): Promise<LoginAttempt[]>;
}
