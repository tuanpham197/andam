import { http, HttpResponse } from 'msw';

export const API = '*/api/v1';

export const session = (token = 'access-1') => ({
  userId: '00000000-0000-4000-8000-000000000001',
  accessToken: token,
  accessTokenExpiresAt: '2026-09-28T03:15:00.000Z',
});

export const problem = (status: number, code: string, detail?: string) =>
  HttpResponse.json(
    { type: 'about:blank', title: 'x', status, code, detail, instance: '/x' },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );

export const signedOut = () =>
  http.post(`${API}/auth/refresh`, () => problem(401, 'INVALID_REFRESH_TOKEN'));
export const signedIn = (token = 'access-1') =>
  http.post(`${API}/auth/refresh`, () => HttpResponse.json(session(token)));
export const me = (email = 'na@example.vn') =>
  http.get(`${API}/me`, () =>
    HttpResponse.json({
      id: 'u1',
      email,
      timezone: 'Asia/Ho_Chi_Minh',
      createdAt: '2026-09-28T03:00:00Z',
    }),
  );

export const children = (list: unknown[]) =>
  http.get(`${API}/children`, () => HttpResponse.json(list));
