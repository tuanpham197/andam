export const INVITE_TOKENS = Symbol('INVITE_TOKENS');
export const INVITE_SETTINGS = Symbol('INVITE_SETTINGS');

/** 256-bit random tokens; only their hash is ever stored (BR-72). */
export interface InviteTokens {
  create(): { token: string; hash: string };
  hash(token: string): string;
}

export interface InviteSettings {
  /** Where the web app runs: the link is `${webBaseUrl}/invite/${token}`. */
  webBaseUrl: string;
}
