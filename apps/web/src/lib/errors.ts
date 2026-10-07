import { ApiError } from '@appandam/api-client';
import { vi } from '../strings/vi';

/** User-facing Vietnamese message for any error thrown by the API client. */
export function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    const known = (vi.errors as Record<string, string>)[error.code];
    return known ?? error.detail ?? vi.errors.GENERIC;
  }
  return vi.errors.GENERIC;
}

export const errorCode = (error: unknown) => (error instanceof ApiError ? error.code : undefined);
