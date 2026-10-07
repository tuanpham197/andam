import { NodeSecureTokens } from './node-secure-tokens.js';

describe('NodeSecureTokens', () => {
  const tokens = new NodeSecureTokens();

  it('generates 256-bit URL-safe secrets that do not repeat', () => {
    const generated = Array.from({ length: 100 }, () => tokens.generate());
    for (const token of generated) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Set(generated).size).toBe(100);
  });

  it('hashes deterministically with SHA-256 hex', () => {
    expect(tokens.hash('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(tokens.hash('abc')).toBe(tokens.hash('abc'));
  });
});
