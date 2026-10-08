import { DomainError } from '../../../shared/kernel/domain-error.js';

export class HealthChildNotFoundError extends DomainError {
  readonly code = 'CHILD_NOT_FOUND';
  readonly kind = 'not_found';
  constructor() {
    super('Không tìm thấy hồ sơ bé');
  }
}

export class InvalidHealthDateError extends DomainError {
  readonly code = 'INVALID_DATE';
  readonly kind = 'invalid_input';
  constructor() {
    super('Ngày không hợp lệ');
  }
}

export class HealthEndBeforeStartError extends DomainError {
  readonly code = 'HEALTH_END_BEFORE_START';
  readonly kind = 'rule_violation';
  constructor() {
    super('Ngày dự kiến kết thúc phải từ ngày bắt đầu trở đi');
  }
}

export class HealthStartTooFarError extends DomainError {
  readonly code = 'HEALTH_START_TOO_FAR';
  readonly kind = 'rule_violation';
  constructor() {
    super('Ngày bắt đầu chỉ được trong vòng 7 ngày tới');
  }
}
