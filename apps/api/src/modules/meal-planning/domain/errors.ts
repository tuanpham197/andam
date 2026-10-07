import { DomainError } from '../../../shared/kernel/domain-error.js';
import type { ExclusionReason } from './safety-filter.js';

export class MealAlreadyLoggedError extends DomainError {
  readonly code = 'MEAL_ALREADY_LOGGED';
  readonly kind = 'conflict';
  constructor() {
    super('Bữa này đã được ghi nhận');
  }
}

export class MealNotFoundError extends DomainError {
  readonly code = 'MEAL_NOT_FOUND';
  readonly kind = 'not_found';
  constructor() {
    super('Không tìm thấy bữa ăn');
  }
}

export class DishNotFoundError extends DomainError {
  readonly code = 'DISH_NOT_FOUND';
  readonly kind = 'not_found';
  constructor() {
    super('Không tìm thấy món ăn');
  }
}

export class PlanChildNotFoundError extends DomainError {
  readonly code = 'CHILD_NOT_FOUND';
  readonly kind = 'not_found';
  constructor() {
    super('Không tìm thấy hồ sơ bé');
  }
}

export class InvalidDateError extends DomainError {
  readonly code = 'INVALID_DATE';
  readonly kind = 'invalid_input';
  constructor() {
    super('Ngày không hợp lệ');
  }
}

export class MealInPastError extends DomainError {
  readonly code = 'MEAL_IN_PAST';
  readonly kind = 'rule_violation';
  constructor() {
    super('Không thể đổi món cho ngày đã qua');
  }
}

export class SameDishError extends DomainError {
  readonly code = 'SAME_DISH';
  readonly kind = 'rule_violation';
  constructor() {
    super('Bữa này đang dùng chính món đó');
  }
}

/** Second safety layer: a write never bypasses the hard filter (docs §7.7). */
export class DishNotSafeError extends DomainError {
  readonly code = 'DISH_NOT_SAFE_FOR_CHILD';
  readonly kind = 'rule_violation';
  constructor(readonly reason: ExclusionReason) {
    super('Món này không an toàn cho bé lúc này');
  }
}

export class DishNotForSlotError extends DomainError {
  readonly code = 'DISH_NOT_FOR_SLOT';
  readonly kind = 'rule_violation';
  constructor() {
    super('Món chính không dùng cho bữa phụ và ngược lại');
  }
}

export class ChildNotPlannableError extends DomainError {
  readonly code = 'CHILD_NOT_PLANNABLE';
  readonly kind = 'rule_violation';
  constructor() {
    super('Bé chưa ở độ tuổi được lập thực đơn (6–24 tháng)');
  }
}

export class InvalidWeekStartError extends DomainError {
  readonly code = 'INVALID_WEEK_START';
  readonly kind = 'invalid_input';
  constructor() {
    super('Tuần phải bắt đầu từ Thứ Hai (YYYY-MM-DD)');
  }
}

export class WeekOutOfRangeError extends DomainError {
  readonly code = 'WEEK_OUT_OF_RANGE';
  readonly kind = 'rule_violation';
  constructor() {
    super('Chỉ lên được thực đơn cho tuần này và tuần kế tiếp');
  }
}

export class PlanExistsError extends DomainError {
  readonly code = 'PLAN_EXISTS';
  readonly kind = 'conflict';
  constructor() {
    super('Tuần này đã có thực đơn');
  }
}
