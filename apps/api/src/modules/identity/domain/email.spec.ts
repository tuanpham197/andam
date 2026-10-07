import { normalizeEmail, parseEmail } from './email.js';
import { InvalidEmailError } from './errors.js';

describe('parseEmail', () => {
  it('accepts a regular address', () => {
    expect(parseEmail('na@example.vn')).toBe('na@example.vn');
  });

  it('TC-AUTH-003 trims and lowercases', () => {
    expect(parseEmail('  Me.Na@Example.VN \n')).toBe('me.na@example.vn');
  });

  it('normalises Unicode to NFC so visually equal addresses compare equal', () => {
    const decomposed = 'né@example.vn';
    expect(parseEmail(decomposed)).toBe(parseEmail('né@example.vn'));
  });

  describe('TC-AUTH-004 rejects malformed addresses', () => {
    it.each([
      ['empty', ''],
      ['spaces only', '   '],
      ['missing domain', 'a@'],
      ['missing local part', '@b.com'],
      ['no at sign', 'na.example.vn'],
      ['space inside', 'a b@c.com'],
      ['two at signs', 'a@b@c.com'],
      ['no dot in domain', 'a@localhost'],
      ['local part over 64 chars', `${'a'.repeat(65)}@b.vn`],
      ['total over 254 chars', `a@${'b'.repeat(250)}.vn`],
    ])('%s', (_label, raw) => {
      expect(() => parseEmail(raw)).toThrow(InvalidEmailError);
    });
  });

  it('accepts the longest valid local part (64 chars)', () => {
    expect(parseEmail(`${'a'.repeat(64)}@b.vn`)).toHaveLength(69);
  });

  it('reports INVALID_EMAIL as invalid input', () => {
    const error = (() => {
      try {
        parseEmail('x');
      } catch (e) {
        return e as InvalidEmailError;
      }
    })();
    expect(error).toMatchObject({ code: 'INVALID_EMAIL', kind: 'invalid_input' });
  });
});

describe('normalizeEmail', () => {
  it('normalises without validating (login never reveals why an address fails)', () => {
    expect(normalizeEmail('  NOT-AN-EMAIL ')).toBe('not-an-email');
  });
});
