import {
  AlreadyMemberError,
  InviteNotFoundError,
  MemberLimitError,
  InviteLimitError,
  MemberNotFoundError,
  NotACaregiverError,
  OwnerCannotLeaveError,
  OwnerOnlyError,
} from './errors.js';
import {
  assertCan,
  can,
  displayName,
  MAX_MEMBERS,
  MAX_PENDING_INVITES,
  type ChildAction,
} from './membership.js';

// BR-73, read row by row from the table in the analysis document.
const MATRIX: [ChildAction, boolean, boolean][] = [
  ['view', true, true],
  ['plan', true, true],
  ['log', true, true],
  ['resume_paused', true, false],
  ['edit_profile', true, false],
  ['manage_members', true, false],
  ['delete_child', true, false],
  ['leave', false, true],
];

describe('BR-73 permission matrix', () => {
  it.each(MATRIX)('%s: owner %s, caregiver %s', (action, owner, caregiver) => {
    expect(can('owner', action)).toBe(owner);
    expect(can('caregiver', action)).toBe(caregiver);
  });

  it('TC-FAM-012 refuses a caregiver the owner’s actions with OWNER_ONLY', () => {
    expect(() => assertCan('caregiver', 'edit_profile')).toThrow(OwnerOnlyError);
    expect(() => assertCan('caregiver', 'log')).not.toThrow();
  });

  it('TC-FAM-015 an owner cannot leave (transfer first)', () => {
    expect(() => assertCan('owner', 'leave')).toThrow(OwnerCannotLeaveError);
    expect(() => assertCan('caregiver', 'leave')).not.toThrow();
  });

  it('BR-71 limits', () => {
    expect([MAX_MEMBERS, MAX_PENDING_INVITES]).toEqual([6, 5]);
  });
});

describe('displayName (FR-119)', () => {
  it('uses the chosen name, or the e-mail before "@"', () => {
    expect(displayName('Bà nội', 'ba@example.vn')).toBe('Bà nội');
    expect(displayName(null, 'me.na@example.vn')).toBe('me.na');
  });
});

describe('membership errors', () => {
  it('carry their codes and the child of an existing membership', () => {
    expect(new AlreadyMemberError('c-1').details).toEqual({ childId: 'c-1' });
    expect(
      [
        new InviteNotFoundError(),
        new MemberLimitError(),
        new InviteLimitError(),
        new NotACaregiverError(),
        new MemberNotFoundError(),
      ].map((e) => e.code),
    ).toEqual([
      'INVITE_NOT_FOUND',
      'MEMBER_LIMIT_REACHED',
      'INVITE_LIMIT_REACHED',
      'NOT_A_CAREGIVER',
      'MEMBER_NOT_FOUND',
    ]);
  });
});
