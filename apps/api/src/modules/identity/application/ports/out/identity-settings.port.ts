export const IDENTITY_SETTINGS = Symbol('IDENTITY_SETTINGS');

export interface IdentitySettings {
  /** Web app origin used to build links in e-mails, e.g. https://thucdon.vn */
  webBaseUrl: string;
}
