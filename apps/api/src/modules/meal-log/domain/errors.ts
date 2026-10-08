import { DomainError } from '../../../shared/kernel/domain-error.js';

export class LogMealNotFoundError extends DomainError {
  readonly code = 'MEAL_NOT_FOUND';
  readonly kind = 'not_found';
  constructor() {
    super('Không tìm thấy bữa ăn');
  }
}

export class LogChildNotFoundError extends DomainError {
  readonly code = 'CHILD_NOT_FOUND';
  readonly kind = 'not_found';
  constructor() {
    super('Không tìm thấy hồ sơ bé');
  }
}

/** One log per meal (TC-LOG-004/005): the second parent learns it was already done. */
export class MealLoggedTwiceError extends DomainError {
  readonly code = 'MEAL_ALREADY_LOGGED';
  readonly kind = 'conflict';
  /** BR-77: who logged it and when, so the second parent knows (null name: account deleted). */
  constructor(readonly by?: { name: string | null; at: Date }) {
    super('Bữa này đã được ghi nhận');
  }
  override get details() {
    return this.by && { loggedBy: this.by.name, loggedAt: this.by.at.toISOString() };
  }
}

export class MealNotStartedError extends DomainError {
  readonly code = 'MEAL_IN_FUTURE';
  readonly kind = 'rule_violation';
  constructor() {
    super('Chưa tới ngày của bữa này');
  }
}

export class LoggedAtOutOfRangeError extends DomainError {
  readonly code = 'LOGGED_AT_OUT_OF_RANGE';
  readonly kind = 'rule_violation';
  constructor() {
    super('Giờ ghi nhận không hợp lý với bữa này');
  }
}

export class InvalidLikingError extends DomainError {
  readonly code = 'INVALID_LIKING';
  readonly kind = 'invalid_input';
  constructor() {
    super('Mức thích phải từ 1 đến 5');
  }
}

export class ReactionWithoutSymptomError extends DomainError {
  readonly code = 'REACTION_WITHOUT_SYMPTOM';
  readonly kind = 'rule_violation';
  constructor() {
    super('Hãy chọn ít nhất một dấu hiệu bất thường');
  }
}

export class NoteTooLongError extends DomainError {
  readonly code = 'NOTE_TOO_LONG';
  readonly kind = 'invalid_input';
  constructor() {
    super('Ghi chú tối đa 500 ký tự');
  }
}

export class InvalidCursorError extends DomainError {
  readonly code = 'INVALID_CURSOR';
  readonly kind = 'invalid_input';
  constructor() {
    super('Vị trí trang không hợp lệ');
  }
}
