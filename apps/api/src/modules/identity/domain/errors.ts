import { DomainError } from '../../../shared/kernel/domain-error.js';

export class InvalidEmailError extends DomainError {
  readonly code = 'INVALID_EMAIL';
  readonly kind = 'invalid_input';
  constructor() {
    super('Email không hợp lệ');
  }
}

export class PasswordTooShortError extends DomainError {
  readonly code = 'PASSWORD_TOO_SHORT';
  readonly kind = 'invalid_input';
  constructor() {
    super('Mật khẩu cần ít nhất 8 ký tự');
  }
}

export class PasswordTooLongError extends DomainError {
  readonly code = 'PASSWORD_TOO_LONG';
  readonly kind = 'invalid_input';
  constructor() {
    super('Mật khẩu tối đa 128 ký tự');
  }
}

export class WeakPasswordError extends DomainError {
  readonly code = 'WEAK_PASSWORD';
  readonly kind = 'rule_violation';
  constructor() {
    super('Mật khẩu quá phổ biến, hãy chọn mật khẩu khác');
  }
}

export class ConsentRequiredError extends DomainError {
  readonly code = 'CONSENT_REQUIRED';
  readonly kind = 'rule_violation';
  constructor() {
    super('Cần đồng ý với chính sách xử lý dữ liệu hiện hành');
  }
}

export class EmailTakenError extends DomainError {
  readonly code = 'EMAIL_TAKEN';
  readonly kind = 'conflict';
  constructor() {
    super('Email đã được đăng ký');
  }
}

export class InvalidCredentialsError extends DomainError {
  readonly code = 'INVALID_CREDENTIALS';
  readonly kind = 'unauthenticated';
  constructor() {
    super('Email hoặc mật khẩu không đúng');
  }
}

export class TooManyAttemptsError extends DomainError {
  readonly code = 'TOO_MANY_ATTEMPTS';
  readonly kind = 'too_many_requests';
  constructor() {
    super('Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.');
  }
}

export class InvalidRefreshTokenError extends DomainError {
  readonly code = 'INVALID_REFRESH_TOKEN';
  readonly kind = 'unauthenticated';
  constructor() {
    super('Phiên đăng nhập đã hết hạn');
  }
}

export class InvalidAccessTokenError extends DomainError {
  readonly code = 'UNAUTHENTICATED';
  readonly kind = 'unauthenticated';
  constructor() {
    super('Cần đăng nhập');
  }
}

export class ResetTokenInvalidError extends DomainError {
  readonly code = 'RESET_TOKEN_INVALID';
  readonly kind = 'invalid_input';
  constructor() {
    super('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');
  }
}

export class InvalidDisplayNameError extends DomainError {
  readonly code = 'INVALID_DISPLAY_NAME';
  readonly kind = 'invalid_input';
  constructor() {
    super('Tên hiển thị tối đa 30 ký tự');
  }
}

/** BR-76: the owner of a child other members still use must hand it over (or delete it) first. */
export class OwnershipTransferRequiredError extends DomainError {
  readonly code = 'OWNERSHIP_TRANSFER_REQUIRED';
  readonly kind = 'conflict';
  constructor(readonly children: { id: string; name: string }[]) {
    super('Hãy chuyển quyền chủ hoặc xóa các hồ sơ bé còn người chăm trước khi xóa tài khoản');
  }
  override get details() {
    return { children: this.children };
  }
}
