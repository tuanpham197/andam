import type { CookieOptions, Response } from 'express';

export const REFRESH_COOKIE = 'refresh_token';

// Scoped to the auth routes so the refresh token never rides along other API calls (TC-AUTH-024).
const baseOptions: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/api/v1/auth',
};

export function setRefreshCookie(res: Response, token: string, expires: Date): void {
  res.cookie(REFRESH_COOKIE, token, { ...baseOptions, expires });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, baseOptions);
}
