import { PasswordTooLongError, PasswordTooShortError, WeakPasswordError } from './errors.js';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, acceptablePassword } from './password.js';

describe('acceptablePassword (TC-AUTH-005..007)', () => {
  it('uses the documented bounds', () => {
    expect([MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH]).toEqual([8, 128]);
  });

  it.each([
    ['7 chars', 'Abc!234', PasswordTooShortError],
    ['129 chars', `Xy!${'k'.repeat(126)}`, PasswordTooLongError],
    ['empty', '', PasswordTooShortError],
  ])('rejects %s', (_label, password, error) => {
    expect(() => acceptablePassword(password)).toThrow(error);
  });

  it.each([
    ['exactly 8 chars', 'Abc!2345'],
    ['exactly 128 chars', `Xy!${'k'.repeat(125)}`],
  ])('accepts %s', (_label, password) => {
    expect(acceptablePassword(password)).toBe(password);
  });

  it('counts emoji as one character each, not UTF-16 code units', () => {
    const sevenGraphemes = '🍚🍚🍚🍚🍚🍚🍚';
    expect(() => acceptablePassword(sevenGraphemes)).toThrow(PasswordTooShortError);
    expect(acceptablePassword(`${sevenGraphemes}🥕`)).toBe(`${sevenGraphemes}🥕`);
  });

  it('TC-AUTH-007 normalises to NFC so the same password typed on another keyboard matches', () => {
    const decomposed = 'Mé an dăm 2026';
    expect(acceptablePassword(decomposed)).toBe(decomposed.normalize('NFC'));
  });

  it.each(['12345678', 'password', 'PASSWORD', 'qwertyuiop', '11111111', 'matkhau123'])(
    'TC-AUTH-006 rejects the common password %s',
    (password) => {
      expect(() => acceptablePassword(password)).toThrow(WeakPasswordError);
    },
  );

  it('keeps leading and trailing spaces (they are part of the secret)', () => {
    expect(acceptablePassword('  spaced out  ')).toBe('  spaced out  ');
  });

  it('exposes stable error codes', () => {
    expect(new PasswordTooShortError()).toMatchObject({
      code: 'PASSWORD_TOO_SHORT',
      kind: 'invalid_input',
    });
    expect(new PasswordTooLongError()).toMatchObject({
      code: 'PASSWORD_TOO_LONG',
      kind: 'invalid_input',
    });
    expect(new WeakPasswordError()).toMatchObject({
      code: 'WEAK_PASSWORD',
      kind: 'rule_violation',
    });
  });
});
