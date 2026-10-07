import { DomainError } from '../../../shared/kernel/domain-error.js';

export class InvalidChildNameError extends DomainError {
  readonly code = 'INVALID_CHILD_NAME';
  readonly kind = 'invalid_input';
  constructor() {
    super('Tên bé cần từ 1 đến 30 ký tự');
  }
}

export class InvalidBirthDateError extends DomainError {
  readonly code = 'INVALID_BIRTH_DATE';
  readonly kind = 'invalid_input';
  constructor() {
    super('Ngày sinh không hợp lệ hoặc ở tương lai');
  }
}

export class ChildTooOldError extends DomainError {
  readonly code = 'CHILD_TOO_OLD';
  readonly kind = 'rule_violation';
  constructor() {
    super('Ứng dụng hỗ trợ bé từ 6 đến 24 tháng tuổi');
  }
}

export class InvalidWeeksEarlyError extends DomainError {
  readonly code = 'INVALID_WEEKS_EARLY';
  readonly kind = 'invalid_input';
  constructor() {
    super('Số tuần sinh sớm cần từ 1 đến 16');
  }
}

export class InvalidPriorReactionNoteError extends DomainError {
  readonly code = 'INVALID_PRIOR_REACTION_NOTE';
  readonly kind = 'invalid_input';
  constructor() {
    super('Ghi chú tối đa 500 ký tự');
  }
}

export class TooManyAvoidItemsError extends DomainError {
  readonly code = 'TOO_MANY_AVOID_ITEMS';
  readonly kind = 'invalid_input';
  constructor() {
    super('Danh sách thực phẩm cần tránh tối đa 100 nguyên liệu');
  }
}

export class InvalidStageError extends DomainError {
  readonly code = 'INVALID_STAGE';
  readonly kind = 'invalid_input';
  constructor() {
    super('Giai đoạn không hợp lệ');
  }
}

export class StageAboveAgeError extends DomainError {
  readonly code = 'STAGE_ABOVE_AGE';
  readonly kind = 'rule_violation';
  constructor() {
    super('Không thể chọn giai đoạn cao hơn tuổi của bé');
  }
}

export class ChildNotPlannableError extends DomainError {
  readonly code = 'CHILD_NOT_PLANNABLE';
  readonly kind = 'rule_violation';
  constructor() {
    super('Bé chưa ở độ tuổi được lập thực đơn');
  }
}

export class ChildNotFoundError extends DomainError {
  readonly code = 'CHILD_NOT_FOUND';
  readonly kind = 'not_found';
  constructor() {
    super('Không tìm thấy hồ sơ bé');
  }
}

export class UnknownIngredientError extends DomainError {
  readonly code = 'UNKNOWN_INGREDIENT';
  readonly kind = 'rule_violation';
  constructor(readonly ingredientIds: string[]) {
    super(`Nguyên liệu không tồn tại: ${ingredientIds.join(', ')}`);
  }
}
