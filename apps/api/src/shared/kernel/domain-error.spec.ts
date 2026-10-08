import { DomainError } from './domain-error.js';

class ChildTooYoungError extends DomainError {
  readonly code = 'CHILD_TOO_YOUNG';
  readonly kind = 'rule_violation';
}

describe('DomainError', () => {
  it('carries a stable code, a kind and the message', () => {
    const error = new ChildTooYoungError('Bé chưa đủ 6 tháng');
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('CHILD_TOO_YOUNG');
    expect(error.kind).toBe('rule_violation');
    expect(error.message).toBe('Bé chưa đủ 6 tháng');
  });

  it('uses the subclass name so logs identify the error', () => {
    expect(new ChildTooYoungError('x').name).toBe('ChildTooYoungError');
  });

  it('has no details unless a subclass gives some', () => {
    const error = new (class extends DomainError {
      readonly code = 'X';
      readonly kind = 'conflict' as const;
    })('x');
    expect(error.details).toBeUndefined();
  });
});
