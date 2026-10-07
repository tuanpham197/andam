import { PasswordTooLongError, PasswordTooShortError, WeakPasswordError } from './errors.js';

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

// Short deny-list of the most common choices (global + Vietnamese); compared case-insensitively.
const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  '11111111',
  '00000000',
  '87654321',
  '12341234',
  'password',
  'password1',
  'password123',
  'qwertyui',
  'qwertyuiop',
  'abcd1234',
  'iloveyou',
  'matkhau',
  'matkhau1',
  'matkhau123',
  'anhyeuem',
  'emyeuanh',
  'motconvit',
]);

/**
 * Returns the password as it must be hashed (NFC), or throws when it breaks the policy.
 * Length counts Unicode code points so an emoji is one character.
 */
export function acceptablePassword(raw: string): string {
  const password = raw.normalize('NFC');
  const length = [...password].length;
  if (length < MIN_PASSWORD_LENGTH) throw new PasswordTooShortError();
  if (length > MAX_PASSWORD_LENGTH) throw new PasswordTooLongError();
  if (COMMON_PASSWORDS.has(password.toLowerCase())) throw new WeakPasswordError();
  return password;
}
