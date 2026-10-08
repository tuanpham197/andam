import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ApiError, apiFetch, configureApiClient } from './fetcher.js';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  configureApiClient({ baseUrl: 'http://api.test' });
});
afterAll(() => server.close());

beforeEach(() => configureApiClient({ baseUrl: 'http://api.test' }));

describe('apiFetch', () => {
  it('returns the parsed JSON body of a successful response', async () => {
    server.use(
      http.get('http://api.test/api/v1/health', () => HttpResponse.json({ status: 'ok' })),
    );
    await expect(apiFetch('/api/v1/health', { method: 'GET' })).resolves.toEqual({ status: 'ok' });
  });

  it('sends JSON headers and cookies with the request', async () => {
    let seen: Request | undefined;
    server.use(
      http.post('http://api.test/api/v1/things', ({ request }) => {
        seen = request;
        return HttpResponse.json({ id: 1 }, { status: 201 });
      }),
    );
    await apiFetch('/api/v1/things', { method: 'POST', body: JSON.stringify({ a: 1 }) });
    expect(seen!.headers.get('accept')).toBe('application/json');
    expect(seen!.headers.get('content-type')).toBe('application/json');
    expect(seen!.credentials).toBe('include');
  });

  it('keeps caller headers', async () => {
    let seen: Request | undefined;
    server.use(
      http.get('http://api.test/x', ({ request }) => {
        seen = request;
        return HttpResponse.json({});
      }),
    );
    await apiFetch('/x', { headers: { 'x-request-id': 'abc' } });
    expect(seen!.headers.get('x-request-id')).toBe('abc');
  });

  it('returns undefined for 202 Accepted with an empty body', async () => {
    server.use(http.post('http://api.test/x', () => new HttpResponse(null, { status: 202 })));
    await expect(apiFetch('/x', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('returns undefined for 204 No Content', async () => {
    server.use(http.delete('http://api.test/x', () => new HttpResponse(null, { status: 204 })));
    await expect(apiFetch('/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  describe('errors', () => {
    it('turns problem details into an ApiError with status, code, detail and field errors', async () => {
      server.use(
        http.post('http://api.test/x', () =>
          HttpResponse.json(
            {
              type: 'about:blank',
              title: 'Bad Request',
              status: 400,
              code: 'VALIDATION_FAILED',
              detail: 'Dữ liệu gửi lên không hợp lệ',
              errors: ['name must be a string'],
            },
            { status: 400, headers: { 'content-type': 'application/problem+json' } },
          ),
        ),
      );
      const error = await apiFetch('/x', { method: 'POST' }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 400,
        code: 'VALIDATION_FAILED',
        detail: 'Dữ liệu gửi lên không hợp lệ',
        errors: ['name must be a string'],
        message: 'Dữ liệu gửi lên không hợp lệ',
      });
    });

    it('keeps the extension members of the problem (e.g. which foods are unsafe)', async () => {
      server.use(
        http.post('http://api.test/x', () =>
          HttpResponse.json(
            {
              type: 'about:blank',
              title: 'Unprocessable Entity',
              status: 422,
              code: 'DISH_NOT_SAFE_FOR_CHILD',
              detail: 'x',
              instance: '/x',
              ingredients: [{ id: 'ing_trung_ga', name: 'Trứng gà', reason: 'allergen' }],
            },
            { status: 422 },
          ),
        ),
      );
      const error = (await apiFetch('/x', { method: 'POST' }).catch((e: unknown) => e)) as ApiError;
      expect(error.extensions).toEqual({
        ingredients: [{ id: 'ing_trung_ga', name: 'Trứng gà', reason: 'allergen' }],
      });
    });

    it('falls back to HTTP_<status> when the error body is not JSON', async () => {
      server.use(
        http.get('http://api.test/x', () => new HttpResponse('<html>502</html>', { status: 502 })),
      );
      const error = (await apiFetch('/x', {}).catch((e: unknown) => e)) as ApiError;
      expect(error).toMatchObject({ status: 502, code: 'HTTP_502', errors: [], extensions: {} });
      expect(error.detail).toBeUndefined();
      expect(error.message).toBe('HTTP_502');
    });

    it('falls back to HTTP_<status> when the JSON error has no code', async () => {
      server.use(
        http.get('http://api.test/x', () => HttpResponse.json({ message: 'x' }, { status: 500 })),
      );
      await expect(apiFetch('/x', {})).rejects.toMatchObject({ status: 500, code: 'HTTP_500' });
    });

    it('reports network failures as NETWORK_ERROR with status 0', async () => {
      server.use(http.get('http://api.test/x', () => HttpResponse.error()));
      await expect(apiFetch('/x', {})).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    });

    it('lets aborts through untouched so React Query can cancel', async () => {
      server.use(http.get('http://api.test/x', () => HttpResponse.json({})));
      const controller = new AbortController();
      controller.abort();
      const error = await apiFetch('/x', { signal: controller.signal }).catch((e: unknown) => e);
      expect(error).not.toBeInstanceOf(ApiError);
      expect((error as Error).name).toBe('AbortError');
    });
  });
});

describe('authentication', () => {
  let token: string | null;
  let refreshCalls: number;
  let refreshResult: boolean;

  beforeEach(() => {
    token = 'old-token';
    refreshCalls = 0;
    refreshResult = true;
    configureApiClient({
      baseUrl: 'http://api.test',
      auth: {
        getAccessToken: () => token,
        refreshAccessToken: async () => {
          refreshCalls += 1;
          await new Promise((r) => setTimeout(r, 10));
          if (refreshResult) token = 'new-token';
          return refreshResult;
        },
      },
    });
  });

  /** 401 unless the request carries the new token. */
  function protectedRoute(path = '/api/v1/me') {
    server.use(
      http.get(`http://api.test${path}`, ({ request }) =>
        request.headers.get('authorization') === 'Bearer new-token'
          ? HttpResponse.json({ ok: true })
          : HttpResponse.json({ status: 401, code: 'UNAUTHENTICATED' }, { status: 401 }),
      ),
    );
  }

  it('sends the access token as a Bearer header', async () => {
    let seen: string | null = null;
    server.use(
      http.get('http://api.test/x', ({ request }) => {
        seen = request.headers.get('authorization');
        return HttpResponse.json({});
      }),
    );
    await apiFetch('/x');
    expect(seen).toBe('Bearer old-token');
  });

  it('sends no Authorization header without a token', async () => {
    token = null;
    let seen: string | null = 'unset';
    server.use(
      http.get('http://api.test/x', ({ request }) => {
        seen = request.headers.get('authorization');
        return HttpResponse.json({});
      }),
    );
    await apiFetch('/x');
    expect(seen).toBeNull();
  });

  it('TC-UI-014 refreshes once on 401 and transparently retries the request', async () => {
    protectedRoute();
    await expect(apiFetch('/api/v1/me')).resolves.toEqual({ ok: true });
    expect(refreshCalls).toBe(1);
  });

  it('TC-AUTH-016 shares a single refresh between concurrent 401s', async () => {
    protectedRoute('/api/v1/a');
    protectedRoute('/api/v1/b');
    await Promise.all([apiFetch('/api/v1/a'), apiFetch('/api/v1/b'), apiFetch('/api/v1/a')]);
    expect(refreshCalls).toBe(1);
  });

  it('TC-UI-015 gives up with the 401 when the refresh fails', async () => {
    refreshResult = false;
    protectedRoute();
    await expect(apiFetch('/api/v1/me')).rejects.toMatchObject({ status: 401 });
    expect(refreshCalls).toBe(1);
  });

  it('does not loop when the retried request is still unauthorised', async () => {
    server.use(
      http.get('http://api.test/api/v1/me', () =>
        HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 }),
      ),
    );
    await expect(apiFetch('/api/v1/me')).rejects.toMatchObject({ status: 401 });
    expect(refreshCalls).toBe(1);
  });

  it('never refreshes for the auth endpoints themselves (wrong password is a real 401)', async () => {
    server.use(
      http.post('http://api.test/api/v1/auth/login', () =>
        HttpResponse.json({ code: 'INVALID_CREDENTIALS' }, { status: 401 }),
      ),
    );
    await expect(apiFetch('/api/v1/auth/login', { method: 'POST' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(refreshCalls).toBe(0);
  });

  it('starts a new refresh for a later 401 once the previous one finished', async () => {
    protectedRoute();
    await apiFetch('/api/v1/me');
    token = 'expired-again';
    await apiFetch('/api/v1/me');
    expect(refreshCalls).toBe(2);
  });
});
