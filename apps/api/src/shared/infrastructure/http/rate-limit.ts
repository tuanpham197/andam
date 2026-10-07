import { SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import type { Env } from '../config/env.js';

const AUTH_RATE_LIMITED = 'rate-limit:auth';

/** Applies the strict per-IP limit for credential endpoints (TC-AUTH-023). */
export const AuthRateLimited = () => SetMetadata(AUTH_RATE_LIMITED, true);

export function throttlerOptions(env: Env): ThrottlerModuleOptions {
  return {
    errorMessage: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
    throttlers: [
      {
        name: 'default',
        ttl: 60_000,
        limit: (context: ExecutionContext) =>
          Reflect.getMetadata(AUTH_RATE_LIMITED, context.getClass()) === true
            ? env.AUTH_RATE_LIMIT
            : env.API_RATE_LIMIT,
      },
    ],
  };
}
