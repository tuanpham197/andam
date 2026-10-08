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
  override get details() {
    return { reason: this.reason };
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

/** BR-81/87: which field of a "Món của bạn" is wrong, for the form to point at it. */
export class InvalidCustomDishError extends DomainError {
  readonly code = 'INVALID_CUSTOM_DISH';
  readonly kind = 'invalid_input';
  constructor(readonly field: string) {
    super('Thông tin món chưa hợp lệ');
  }
  override get details() {
    return { field: this.field };
  }
}

export class UnknownDishIngredientError extends DomainError {
  readonly code = 'UNKNOWN_INGREDIENT';
  readonly kind = 'rule_violation';
  constructor(readonly ingredientIds: string[]) {
    super('Có nguyên liệu không có trong danh mục');
  }
  override get details() {
    return { ingredientIds: this.ingredientIds };
  }
}

/** BR-82: the dish would break the hard filter for this child; says which food and why. */
export class CustomDishNotSafeError extends DomainError {
  readonly code = 'DISH_NOT_SAFE_FOR_CHILD';
  readonly kind = 'rule_violation';
  constructor(readonly ingredients: { id: string; name: string; reason: string }[]) {
    super('Món có nguyên liệu không phù hợp với bé lúc này');
  }
  override get details() {
    return { ingredients: this.ingredients };
  }
}

export class DishNameTakenError extends DomainError {
  readonly code = 'DISH_NAME_TAKEN';
  readonly kind = 'conflict';
  constructor() {
    super('Bạn đã có món trùng tên');
  }
}

export class CustomDishLimitError extends DomainError {
  readonly code = 'CUSTOM_DISH_LIMIT_REACHED';
  readonly kind = 'rule_violation';
  constructor() {
    super('Mỗi bé có tối đa 50 món tự tạo');
  }
}

/** BR-77: another member changed the meal since this parent looked at it. */
export class MealChangedError extends DomainError {
  readonly code = 'MEAL_CHANGED';
  readonly kind = 'conflict';
  constructor() {
    super('Bữa này vừa được người nhà đổi sang món khác');
  }
}
