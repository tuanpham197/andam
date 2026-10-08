import { apiFetch } from '@appandam/api-client';
import { dehydrate, QueryClient, type Query } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { App } from '../App';
import {
  getSession,
  resetSession,
  setAnonymous,
  setAuthenticated,
} from '../features/auth/session-store';
import { API, problem, signedIn } from '../test/api';
import { NA_ID, childFixture } from '../test/fixtures';
import { server } from '../test/server';
import { CACHE_KEY, createQueryClient, persistOptions, shouldPersist } from './query-cache';
import { refreshSessionOnce } from './session-refresh';

const query = (key: string, status: 'success' | 'error' | 'pending') =>
  ({ queryKey: [key], state: { status } }) as unknown as Query;

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('query cache for offline reading (NFR-008)', () => {
  it.each([
    '/api/v1/stages',
    '/api/v1/children',
    `/api/v1/children/${NA_ID}`,
    `/api/v1/children/${NA_ID}/days/2026-09-24`,
    `/api/v1/children/${NA_ID}/weeks/2026-09-21`,
    `/api/v1/children/${NA_ID}/dishes/dish_chao_ga`,
    `/api/v1/children/${NA_ID}/health`,
  ])('keeps %s for offline reading', (key) => {
    expect(shouldPersist(query(key, 'success'))).toBe(true);
    expect(shouldPersist(query(key, 'error'))).toBe(false);
  });

  it.each([
    '/api/v1/me',
    // The token in an invite link is a credential (it is redacted from the API logs too).
    '/api/v1/invites/secret-token',
    // Other members' e-mail addresses.
    `/api/v1/children/${NA_ID}/members`,
    `/api/v1/children/${NA_ID}/journal`,
    `/api/v1/children/${NA_ID}/dishes`,
    `/api/v1/children/${NA_ID}/paused-ingredients`,
    `/api/v1/meals/${NA_ID}/log`,
  ])('never writes %s to the device', (key) => {
    expect(shouldPersist(query(key, 'success'))).toBe(false);
  });

  it('keeps queries a day and lets saving fail at once without network', () => {
    const client = createQueryClient();
    expect(client.getDefaultOptions().queries?.gcTime).toBe(24 * 60 * 60 * 1000);
    expect(client.getDefaultOptions().mutations?.networkMode).toBe('always');
  });

  it('erases the cached data as soon as nobody is signed in', () => {
    const client = new QueryClient();
    const options = persistOptions(client, localStorage);
    expect(options.maxAge).toBe(24 * 60 * 60 * 1000);
    client.setQueryData(['/api/v1/children'], [childFixture()]);
    localStorage.setItem(CACHE_KEY, '{"clientState":{}}');

    setAuthenticated('access-1');
    expect(localStorage.getItem(CACHE_KEY)).not.toBeNull();
    setAnonymous();
    expect(client.getQueryData(['/api/v1/children'])).toBeUndefined();
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it('works where the browser offers no storage', () => {
    const client = new QueryClient();
    persistOptions(client, undefined);
    client.setQueryData(['x'], 1);
    setAnonymous();
    expect(client.getQueryData(['x'])).toBeUndefined();
  });

  it('restores the last menu after a reload without network (TC-UI-027)', async () => {
    // First visit, online: what the parent reads is stored on the device.
    server.use(signedIn());
    const first = render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Bé Na' })).toBeVisible();
    await waitFor(() => expect(localStorage.getItem(CACHE_KEY)).toContain('/days/'), {
      timeout: 3000,
    });
    first.unmount();

    // Reload offline: the session cannot be checked, the cached app opens anyway.
    act(() => resetSession());
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event('offline')));
    server.use(http.post(`${API}/auth/refresh`, () => HttpResponse.error()));
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Bé Na' })).toBeVisible();
    expect(getSession().status).toBe('offline');
    expect(screen.getByText(/Không có kết nối mạng/)).toBeInTheDocument();
    expect(screen.getAllByText('Cháo cá hồi rau ngót').length).toBeGreaterThan(0);

    // Network back: the session is checked again and the app carries on signed in.
    server.use(signedIn('access-2'));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(getSession().accessToken).toBe('access-2'));
    expect(screen.queryByText(/Không có kết nối mạng/)).not.toBeInTheDocument();
  });
});

/** What the persister would have written for `children` a moment ago. */
function cacheChildren(children: unknown[]) {
  const client = new QueryClient();
  client.setQueryData(['/api/v1/children'], children);
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      buster: '',
      timestamp: Date.now(),
      clientState: dehydrate(client, { shouldDehydrateQuery: () => true }),
    }),
  );
}

describe('a reload on an out-of-date cached child list (TC-UI-028)', () => {
  afterEach(() => window.history.pushState({}, '', '/'));

  it('stays on the requested screen when the profile was created after the cache was saved', async () => {
    server.use(signedIn());
    cacheChildren([]);
    window.history.pushState({}, '', '/health');
    render(<App />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hôm nay bé Na thế nào?' }),
    ).toBeVisible();
    expect(window.location.pathname).toBe('/health');
  });

  it('stays on onboarding when the cached child is gone on the server', async () => {
    server.use(
      signedIn(),
      http.get(`${API}/children`, () => HttpResponse.json([])),
    );
    cacheChildren([childFixture()]);
    window.history.pushState({}, '', '/onboarding/1');
    render(<App />);
    expect(await screen.findByLabelText('Tên hoặc tên gọi ở nhà của bé')).toBeVisible();
    expect(window.location.pathname).toBe('/onboarding/1');
  });
});

describe('session checks without an answer from the server', () => {
  it('opens offline when the session cannot be checked at start-up, and checks again online', async () => {
    server.use(http.post(`${API}/auth/refresh`, () => HttpResponse.error()));
    await expect(refreshSessionOnce()).resolves.toBe(false);
    expect(getSession().status).toBe('offline');

    // Still nothing: stays offline.
    await refreshSessionOnce();
    expect(getSession().status).toBe('offline');

    server.use(signedIn());
    await expect(refreshSessionOnce()).resolves.toBe(true);
    expect(getSession()).toMatchObject({ status: 'authenticated', accessToken: 'access-1' });
  });

  it('treats a server failure like no network: the user is not signed out', async () => {
    server.use(http.post(`${API}/auth/refresh`, () => problem(503, 'UNAVAILABLE')));
    await refreshSessionOnce();
    expect(getSession().status).toBe('offline');
  });

  it('keeps a signed-in user on the current screen when a refresh gets no answer', async () => {
    setAuthenticated('access-1');
    server.use(
      http.post(`${API}/auth/refresh`, () => HttpResponse.error()),
      http.get(`${API}/ping`, () => problem(401, 'UNAUTHENTICATED')),
    );
    await expect(apiFetch('/api/v1/ping')).rejects.toMatchObject({ status: 401 });
    expect(getSession()).toMatchObject({ status: 'authenticated', expired: false });
  });
});
