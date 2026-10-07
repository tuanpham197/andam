import { InvalidEmailError } from './errors.js';

export type Email = string & { readonly __brand: 'Email' };

const MAX_LENGTH = 254;
const MAX_LOCAL_PART = 64;
const SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trim, lowercase and NFC-normalise, so one person maps to one account (TC-AUTH-002/003). */
export function normalizeEmail(raw: string): string {
  return raw.normalize('NFC').trim().toLowerCase();
}

export function parseEmail(raw: string): Email {
  const email = normalizeEmail(raw);
  const localPart = email.split('@')[0]!;
  if (email.length > MAX_LENGTH || localPart.length > MAX_LOCAL_PART || !SHAPE.test(email)) {
    throw new InvalidEmailError();
  }
  return email as Email;
}
