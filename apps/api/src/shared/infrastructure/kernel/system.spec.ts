import { RandomUuidGenerator, SystemClock } from './system.js';

describe('SystemClock', () => {
  it('returns the current time', () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});

describe('RandomUuidGenerator', () => {
  it('generates distinct RFC 4122 v4 UUIDs', () => {
    const ids = new RandomUuidGenerator();
    const a = ids.next();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(ids.next()).not.toBe(a);
  });
});
