import { apiFetch } from '@appandam/api-client';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { setupApiClient } from './api';

afterEach(() => {
  vi.unstubAllEnvs();
  setupApiClient();
});

describe('setupApiClient', () => {
  it('calls the API on the page origin by default', async () => {
    server.use(
      http.get(`${window.location.origin}/api/v1/ping`, () => HttpResponse.json('same-origin')),
    );
    setupApiClient();
    await expect(apiFetch('/api/v1/ping')).resolves.toBe('same-origin');
  });

  it('uses VITE_API_BASE_URL when the API lives on another host', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.thucdon.test');
    server.use(http.get('https://api.thucdon.test/api/v1/ping', () => HttpResponse.json('remote')));
    setupApiClient();
    await expect(apiFetch('/api/v1/ping')).resolves.toBe('remote');
  });
});
