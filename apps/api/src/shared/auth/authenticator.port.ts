export const AUTHENTICATOR = Symbol('AUTHENTICATOR');

/** Implemented by the identity module; rejects with a 401 domain error when not signed in. */
export interface Authenticator {
  execute(input: { accessToken: string | undefined }): Promise<{ userId: string }>;
}

export interface AuthenticatedUser {
  userId: string;
}
