import { DomainError } from '../../../shared/kernel/domain-error.js';

export class SafetyChildNotFoundError extends DomainError {
  readonly code = 'CHILD_NOT_FOUND';
  readonly kind = 'not_found';
  constructor() {
    super('Không tìm thấy hồ sơ bé');
  }
}

export class SafetyMealNotFoundError extends DomainError {
  readonly code = 'MEAL_NOT_FOUND';
  readonly kind = 'not_found';
  constructor() {
    super('Không tìm thấy bữa ăn');
  }
}

export class UrgentEventNotFoundError extends DomainError {
  readonly code = 'URGENT_EVENT_NOT_FOUND';
  readonly kind = 'not_found';
  constructor() {
    super('Không tìm thấy ghi nhận khẩn cấp');
  }
}

export class IngredientNotPausedError extends DomainError {
  readonly code = 'INGREDIENT_NOT_PAUSED';
  readonly kind = 'conflict';
  constructor() {
    super('Nguyên liệu này không đang tạm dừng');
  }
}

export class SafetyOwnerOnlyError extends DomainError {
  readonly code = 'OWNER_ONLY';
  readonly kind = 'forbidden';
  constructor() {
    super('Chỉ chủ hồ sơ được cho dùng lại nguyên liệu tạm dừng');
  }
}
