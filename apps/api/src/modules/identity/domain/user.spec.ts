import { InvalidDisplayNameError } from './errors.js';
import { User } from './user.js';

const now = new Date('2026-09-28T10:00:00Z');

function register() {
  return User.register({
    id: 'u-1',
    email: 'na@example.vn' as never,
    passwordHash: 'hash-1',
    now,
  });
}

describe('User', () => {
  it('registers with the Vietnam timezone by default and is active', () => {
    const user = register();
    expect(user).toMatchObject({
      id: 'u-1',
      email: 'na@example.vn',
      passwordHash: 'hash-1',
      timezone: 'Asia/Ho_Chi_Minh',
      createdAt: now,
      deletedAt: null,
    });
    expect(user.isActive).toBe(true);
  });

  it('changes its password hash', () => {
    const user = register();
    user.changePassword('hash-2');
    expect(user.passwordHash).toBe('hash-2');
  });

  it('becomes inactive once deleted and keeps the first deletion time', () => {
    const user = register();
    const later = new Date(now.getTime() + 1000);
    user.delete(now);
    user.delete(later);
    expect(user.deletedAt).toEqual(now);
    expect(user.isActive).toBe(false);
  });

  it('can be rebuilt from persistence', () => {
    const user = User.restore({
      id: 'u-2',
      email: 'bin@example.vn' as never,
      passwordHash: 'h',
      timezone: 'Asia/Bangkok',
      displayName: 'Bin',
      createdAt: now,
      deletedAt: now,
    });
    expect(user.isActive).toBe(false);
    expect(user.timezone).toBe('Asia/Bangkok');
  });

  describe('rename (FR-119, TC-FAM-025)', () => {
    const fresh = () =>
      User.register({ id: 'u-3', email: 'na@example.vn' as never, passwordHash: 'h', now });

    it('starts without a display name, then keeps a trimmed NFC name with single spaces', () => {
      const user = fresh();
      expect(user.displayName).toBeNull();
      user.rename('  Bà   nội  ');
      expect(user.displayName).toBe('Bà nội');
    });

    it('clears the name when empty, blank or null', () => {
      const user = fresh();
      for (const blank of ['', '   ', null]) {
        user.rename('Mẹ');
        user.rename(blank);
        expect(user.displayName).toBeNull();
      }
    });

    it('accepts 30 characters (emoji count as one) and refuses 31', () => {
      const user = fresh();
      user.rename('👨‍👩‍👧'.repeat(30));
      expect(user.displayName).toBe('👨‍👩‍👧'.repeat(30));
      expect(() => user.rename('x'.repeat(31))).toThrow(InvalidDisplayNameError);
    });

    it('keeps markup as plain text', () => {
      const user = fresh();
      user.rename('<script>x</script>');
      expect(user.displayName).toBe('<script>x</script>');
    });
  });
});
