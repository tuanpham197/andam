import { ApiError } from '@appandam/api-client';
import { errorCode, messageFor } from './errors';

describe('messageFor', () => {
  it('translates a known code', () => {
    expect(messageFor(new ApiError(401, 'INVALID_CREDENTIALS', 'Wrong'))).toBe(
      'Email hoặc mật khẩu không đúng',
    );
  });

  it('falls back to the server detail for a code the app does not know yet', () => {
    expect(messageFor(new ApiError(422, 'CHILD_TOO_YOUNG', 'Bé chưa đủ 6 tháng'))).toBe(
      'Bé chưa đủ 6 tháng',
    );
  });

  it('falls back to a generic message without code nor detail', () => {
    expect(messageFor(new ApiError(500, 'INTERNAL_ERROR'))).toBe(
      'Đã có lỗi xảy ra. Vui lòng thử lại.',
    );
  });

  it.each([new Error('boom'), 'string', undefined, null])('is generic for %j', (error) => {
    expect(messageFor(error)).toBe('Đã có lỗi xảy ra. Vui lòng thử lại.');
  });
});

describe('errorCode', () => {
  it('reads the code of an ApiError and ignores anything else', () => {
    expect(errorCode(new ApiError(409, 'EMAIL_TAKEN'))).toBe('EMAIL_TAKEN');
    expect(errorCode(new Error('x'))).toBeUndefined();
  });
});
