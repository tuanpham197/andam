import {
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
  type ArgumentsHost,
} from '@nestjs/common';
import { DomainError, type DomainErrorKind } from '../../kernel/domain-error.js';
import { ProblemDetailsFilter } from './problem-details.filter.js';

class FakeResponse {
  statusCode = 0;
  headers: Record<string, string> = {};
  body: unknown;
  status(code: number) {
    this.statusCode = code;
    return this;
  }
  setHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
    return this;
  }
  send(body: string) {
    this.body = JSON.parse(body);
    return this;
  }
}

function hostFor(response: FakeResponse, url = '/api/v1/things/1'): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ originalUrl: url }),
    }),
  } as unknown as ArgumentsHost;
}

function domainError(kind: DomainErrorKind, code = 'SOME_RULE') {
  return new (class extends DomainError {
    readonly code = code;
    readonly kind = kind;
  })('Thông điệp nghiệp vụ');
}

describe('ProblemDetailsFilter', () => {
  const logger = { error: vi.fn() };
  const filter = new ProblemDetailsFilter(logger);

  beforeEach(() => logger.error.mockClear());

  function run(exception: unknown, url?: string) {
    const response = new FakeResponse();
    filter.catch(exception, hostFor(response, url));
    return response;
  }

  it('writes application/problem+json with the request path as instance', () => {
    const response = run(new NotFoundException(), '/api/v1/children/42');
    expect(response.headers['content-type']).toBe('application/problem+json; charset=utf-8');
    expect(response.body).toMatchObject({ instance: '/api/v1/children/42', type: 'about:blank' });
  });

  it.each<[DomainErrorKind, number, string]>([
    ['invalid_input', 400, 'Bad Request'],
    ['not_found', 404, 'Not Found'],
    ['conflict', 409, 'Conflict'],
    ['forbidden', 403, 'Forbidden'],
    ['gone', 410, 'Gone'],
    ['rule_violation', 422, 'Unprocessable Entity'],
    ['unauthenticated', 401, 'Unauthorized'],
    ['too_many_requests', 429, 'Too Many Requests'],
  ])('maps a %s domain error to %i', (kind, status, title) => {
    const response = run(domainError(kind, 'MEAL_ALREADY_LOGGED'));
    expect(response.statusCode).toBe(status);
    expect(response.body).toEqual({
      type: 'about:blank',
      title,
      status,
      code: 'MEAL_ALREADY_LOGGED',
      detail: 'Thông điệp nghiệp vụ',
      instance: '/api/v1/things/1',
    });
  });

  it('adds the error details as extension members, never over the standard ones', () => {
    const error = new (class extends DomainError {
      readonly code = 'DISH_NOT_SAFE_FOR_CHILD';
      readonly kind = 'rule_violation' as const;
      override get details() {
        return { ingredients: [{ id: 'ing_trung', reason: 'allergen' }], status: 200, code: 'X' };
      }
    })('Món có nguyên liệu không phù hợp');
    const response = run(error);
    expect(response.body).toEqual({
      type: 'about:blank',
      title: 'Unprocessable Entity',
      status: 422,
      code: 'DISH_NOT_SAFE_FOR_CHILD',
      detail: 'Món có nguyên liệu không phù hợp',
      ingredients: [{ id: 'ing_trung', reason: 'allergen' }],
      instance: '/api/v1/things/1',
    });
  });

  it('keeps the status of an HttpException and derives a code from it', () => {
    const response = run(new NotFoundException('Không tìm thấy bữa ăn'));
    expect(response.statusCode).toBe(404);
    expect(response.body).toMatchObject({
      title: 'Not Found',
      status: 404,
      code: 'NOT_FOUND',
      detail: 'Không tìm thấy bữa ăn',
    });
  });

  it('TC-API-001 turns ValidationPipe message arrays into an errors list', () => {
    const response = run(new BadRequestException(['name must be a string', 'age must be > 0']));
    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      detail: 'Dữ liệu gửi lên không hợp lệ',
      errors: ['name must be a string', 'age must be > 0'],
    });
  });

  it('accepts an explicit code on an HttpException body', () => {
    const response = run(
      new HttpException(
        { message: 'Chậm lại', code: 'TOO_MANY_ATTEMPTS' },
        HttpStatus.TOO_MANY_REQUESTS,
      ),
    );
    expect(response.body).toMatchObject({
      status: 429,
      code: 'TOO_MANY_ATTEMPTS',
      detail: 'Chậm lại',
    });
  });

  it('omits detail when the HttpException carries no message', () => {
    const response = run(new HttpException({}, HttpStatus.FORBIDDEN));
    expect(response.body).toEqual({
      type: 'about:blank',
      title: 'Forbidden',
      status: 403,
      code: 'FORBIDDEN',
      instance: '/api/v1/things/1',
    });
  });

  it('falls back to a generic title and code for statuses without a known phrase', () => {
    const response = run(new HttpException('teapot-ish', 499));
    expect(response.body).toMatchObject({ title: 'Error', status: 499, code: 'HTTP_499' });
  });

  it.each([
    ['entity.parse.failed', 400, 'MALFORMED_JSON'],
    ['entity.too.large', 413, 'PAYLOAD_TOO_LARGE'],
  ])('TC-API-001/002 maps body-parser error %s to %i', (type, status, code) => {
    const error = Object.assign(new SyntaxError('Unexpected token'), { type, status });
    const response = run(error);
    expect(response.statusCode).toBe(status);
    expect(response.body).toMatchObject({ status, code });
    expect(response.body).not.toHaveProperty('detail');
  });

  describe('TC-API-005 unexpected errors', () => {
    it('answer 500 without leaking the message or stack', () => {
      const response = run(new Error('connect ECONNREFUSED 10.0.0.5:5432 password=secret'));
      expect(response.statusCode).toBe(500);
      expect(response.body).toEqual({
        type: 'about:blank',
        title: 'Internal Server Error',
        status: 500,
        code: 'INTERNAL_ERROR',
        instance: '/api/v1/things/1',
      });
      expect(JSON.stringify(response.body)).not.toMatch(/ECONNREFUSED|secret|at /);
    });

    it('log the original error with its stack for operators', () => {
      const error = new Error('boom');
      run(error);
      expect(logger.error).toHaveBeenCalledWith('Unhandled exception: boom', error.stack);
    });

    it('handle non-Error throwables', () => {
      expect(run('a string was thrown').statusCode).toBe(500);
      expect(logger.error).toHaveBeenLastCalledWith(
        'Unhandled exception: a string was thrown',
        undefined,
      );
      expect(run(undefined).statusCode).toBe(500);
      expect(logger.error).toHaveBeenLastCalledWith('Unhandled exception: undefined', undefined);
    });

    it('do not log expected client errors', () => {
      run(new NotFoundException());
      run(domainError('conflict'));
      expect(logger.error).not.toHaveBeenCalled();
    });
  });
});
