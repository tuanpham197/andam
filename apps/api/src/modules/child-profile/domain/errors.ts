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

/** BR-74: a member asking for something only the owner may do. */
export class OwnerOnlyError extends DomainError {
  readonly code = 'OWNER_ONLY';
  readonly kind = 'forbidden';
  constructor() {
    super('Chỉ chủ hồ sơ được thực hiện thao tác này');
  }
}

export class InviteNotFoundError extends DomainError {
  readonly code = 'INVITE_NOT_FOUND';
  readonly kind = 'not_found';
  constructor() {
    super('Lời mời không tồn tại');
  }
}

export class InviteExpiredError extends DomainError {
  readonly code = 'INVITE_EXPIRED';
  readonly kind = 'gone';
  constructor() {
    super('Lời mời đã hết hạn');
  }
}

export class InviteRevokedError extends DomainError {
  readonly code = 'INVITE_REVOKED';
  readonly kind = 'gone';
  constructor() {
    super('Lời mời đã bị thu hồi');
  }
}

export class InviteUsedError extends DomainError {
  readonly code = 'INVITE_USED';
  readonly kind = 'conflict';
  constructor() {
    super('Lời mời đã được dùng');
  }
}

export class AlreadyMemberError extends DomainError {
  readonly code = 'ALREADY_MEMBER';
  readonly kind = 'conflict';
  constructor(readonly childId: string) {
    super('Bạn đã là thành viên của hồ sơ bé này');
  }
  override get details() {
    return { childId: this.childId };
  }
}

export class MemberLimitError extends DomainError {
  readonly code = 'MEMBER_LIMIT_REACHED';
  readonly kind = 'rule_violation';
  constructor() {
    super('Mỗi bé có tối đa 6 người chăm (gồm chủ hồ sơ)');
  }
}

export class InviteLimitError extends DomainError {
  readonly code = 'INVITE_LIMIT_REACHED';
  readonly kind = 'rule_violation';
  constructor() {
    super('Đã có 5 lời mời đang chờ');
  }
}

export class OwnerCannotLeaveError extends DomainError {
  readonly code = 'OWNER_CANNOT_LEAVE';
  readonly kind = 'rule_violation';
  constructor() {
    super('Chủ hồ sơ cần chuyển quyền chủ trước khi rời');
  }
}

export class NotACaregiverError extends DomainError {
  readonly code = 'NOT_A_CAREGIVER';
  readonly kind = 'rule_violation';
  constructor() {
    super('Chỉ chuyển quyền chủ cho người chăm của bé');
  }
}

export class MemberNotFoundError extends DomainError {
  readonly code = 'MEMBER_NOT_FOUND';
  readonly kind = 'not_found';
  constructor() {
    super('Người này không phải thành viên của hồ sơ bé');
  }
}
