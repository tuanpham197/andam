import { DomainError } from '../../../shared/kernel/domain-error.js';

export class InvalidSearchQueryError extends DomainError {
  readonly code = 'INVALID_SEARCH_QUERY';
  readonly kind = 'invalid_input';
  constructor() {
    super('Từ khóa tìm kiếm cần từ 1 đến 100 ký tự');
  }
}
