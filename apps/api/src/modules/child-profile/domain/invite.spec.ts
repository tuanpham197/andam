import { InviteExpiredError, InviteRevokedError, InviteUsedError } from './errors.js';
import { ChildInvite, INVITE_TTL_MS } from './invite.js';

const NOW = new Date('2026-10-08T02:00:00Z');
const at = (ms: number) => new Date(NOW.getTime() + ms);

const invite = () =>
  ChildInvite.issue({ id: 'i-1', childId: 'c-1', tokenHash: 'h', createdBy: 'u-1', now: NOW });

describe('ChildInvite (BR-72)', () => {
  it('is pending for 72 hours after it is issued', () => {
    expect(invite()).toMatchObject({
      id: 'i-1',
      childId: 'c-1',
      tokenHash: 'h',
      createdBy: 'u-1',
      createdAt: NOW,
      expiresAt: at(INVITE_TTL_MS),
      acceptedBy: null,
      acceptedAt: null,
      revokedAt: null,
    });
    expect(INVITE_TTL_MS).toBe(72 * 3600 * 1000);
  });

  it('TC-FAM-004 usable 1 ms before 72 hours, expired at 72 hours and after', () => {
    expect(invite().status(at(INVITE_TTL_MS - 1))).toBe('pending');
    expect(() => invite().assertUsable(at(INVITE_TTL_MS - 1))).not.toThrow();
    expect(invite().status(at(INVITE_TTL_MS))).toBe('expired');
    expect(() => invite().assertUsable(at(INVITE_TTL_MS))).toThrow(InviteExpiredError);
    expect(() => invite().assertUsable(at(INVITE_TTL_MS + 1))).toThrow(InviteExpiredError);
  });

  it('is accepted once (TC-FAM-005)', () => {
    const i = invite();
    i.accept('u-2', at(1000));
    expect(i).toMatchObject({ acceptedBy: 'u-2', acceptedAt: at(1000) });
    expect(i.status(at(INVITE_TTL_MS + 1))).toBe('accepted');
    expect(() => i.accept('u-3', at(2000))).toThrow(InviteUsedError);
  });

  it('TC-FAM-006 a revoked link says so, even after it would have expired', () => {
    const i = invite();
    i.revoke(at(1000));
    i.revoke(at(5000));
    expect(i.revokedAt).toEqual(at(1000));
    expect(i.status(at(INVITE_TTL_MS + 1))).toBe('revoked');
    expect(() => i.accept('u-2', at(2000))).toThrow(InviteRevokedError);
  });

  it('cannot revoke a link already used', () => {
    const i = invite();
    i.accept('u-2', at(1000));
    expect(() => i.revoke(at(2000))).toThrow(InviteUsedError);
  });

  it('restores a stored invite as a copy', () => {
    const state = {
      id: 'i-2',
      childId: 'c-1',
      tokenHash: 'h2',
      createdBy: 'u-1',
      createdAt: NOW,
      expiresAt: at(10),
      acceptedBy: null,
      acceptedAt: null,
      revokedAt: null,
    };
    const restored = ChildInvite.restore(state);
    restored.revoke(NOW);
    expect(state.revokedAt).toBeNull();
  });
});
