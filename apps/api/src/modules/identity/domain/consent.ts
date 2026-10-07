import { ConsentRequiredError } from './errors.js';

/** Bump when the privacy policy changes; users must accept the new version (docs §7.9). */
export const CURRENT_CONSENT_VERSION = '2026-09-28';

export function assertConsent(version: string | undefined): void {
  if (version !== CURRENT_CONSENT_VERSION) throw new ConsentRequiredError();
}
