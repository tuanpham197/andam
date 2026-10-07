import { Argon2PasswordHasher } from './argon2-password-hasher.js';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('produces an argon2id hash that never contains the password', async () => {
    const hash = await hasher.hash('Cháo cá hồi 2026');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('Cháo');
  });

  it('salts every hash', async () => {
    expect(await hasher.hash('same password')).not.toBe(await hasher.hash('same password'));
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hasher.hash('Cháo cá hồi 2026');
    await expect(hasher.verify(hash, 'Cháo cá hồi 2026')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'cháo cá hồi 2026')).resolves.toBe(false);
  });

  it('answers false instead of throwing for a corrupted hash', async () => {
    await expect(hasher.verify('not-a-hash', 'x')).resolves.toBe(false);
  });
});
