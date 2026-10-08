import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { STATUS_CODES } from 'node:http';
import { DomainError, type DomainErrorKind } from '../../kernel/domain-error.js';

/** RFC 9457 Problem Details, extended with a stable `code` and optional field `errors`. */
export interface ProblemDetails {
  type: 'about:blank';
  title: string;
  status: number;
  code: string;
  detail?: string;
  errors?: string[];
  instance: string;
}

const STATUS_BY_KIND: Record<DomainErrorKind, number> = {
  invalid_input: 400,
  not_found: 404,
  conflict: 409,
  forbidden: 403,
  gone: 410,
  rule_violation: 422,
  unauthenticated: 401,
  too_many_requests: 429,
};

// body-parser signals its failures through `type`; they never reach a controller.
const BODY_PARSER_CODES: Record<string, string> = {
  'entity.parse.failed': 'MALFORMED_JSON',
  'entity.too.large': 'PAYLOAD_TOO_LARGE',
};

const VALIDATION_DETAIL = 'Dữ liệu gửi lên không hợp lệ';

type Problem = Omit<ProblemDetails, 'type' | 'title' | 'instance'>;

interface ErrorLogger {
  error(message: string, stack?: string): void;
}

interface HttpResponseLike {
  status(code: number): HttpResponseLike;
  setHeader(name: string, value: string): unknown;
  send(body: string): unknown;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(private readonly logger: ErrorLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<HttpResponseLike>();
    const request = http.getRequest<{ originalUrl: string }>();

    const problem = this.toProblem(exception);
    // Extension members from DomainError.details (RFC 9457 §3.2); standard members win.
    const body: ProblemDetails & Record<string, unknown> = {
      ...(exception instanceof DomainError ? exception.details : undefined),
      type: 'about:blank',
      title: STATUS_CODES[problem.status] ?? 'Error',
      ...problem,
      instance: request.originalUrl,
    };

    response
      .status(body.status)
      .setHeader('Content-Type', 'application/problem+json; charset=utf-8');
    response.send(JSON.stringify(body));
  }

  private toProblem(exception: unknown): Problem {
    if (exception instanceof DomainError) {
      return {
        status: STATUS_BY_KIND[exception.kind],
        code: exception.code,
        detail: exception.message,
      };
    }
    if (exception instanceof HttpException) {
      return fromHttpException(exception);
    }
    const bodyParserCode = bodyParserCodeOf(exception);
    if (bodyParserCode) {
      return { status: (exception as { status: number }).status, code: bodyParserCode };
    }
    this.logger.error(
      `Unhandled exception: ${exception instanceof Error ? exception.message : String(exception)}`,
      exception instanceof Error ? exception.stack : undefined,
    );
    return { status: 500, code: 'INTERNAL_ERROR' };
  }
}

function fromHttpException(exception: HttpException): Problem {
  const status = exception.getStatus();
  const payload = exception.getResponse();
  const body = (typeof payload === 'object' ? payload : { message: payload }) as {
    message?: string | string[];
    code?: string;
  };

  if (Array.isArray(body.message)) {
    return { status, code: 'VALIDATION_FAILED', detail: VALIDATION_DETAIL, errors: body.message };
  }

  const problem: Problem = { status, code: body.code ?? codeForStatus(status) };
  const detail = body.message;
  if (detail && detail !== STATUS_CODES[status]) problem.detail = detail;
  return problem;
}

function codeForStatus(status: number): string {
  const phrase = STATUS_CODES[status];
  return phrase ? phrase.toUpperCase().replace(/[^A-Z]+/g, '_') : `HTTP_${status}`;
}

export function bodyParserCodeOf(exception: unknown): string | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  const type = (exception as { type?: unknown }).type;
  return typeof type === 'string' ? BODY_PARSER_CODES[type] : undefined;
}
