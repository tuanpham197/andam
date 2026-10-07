import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { resetSession } from '../features/auth/session-store';
import { setupApiClient } from '../lib/api';
import { forgetPendingRefresh } from '../lib/session-refresh';
import { server } from './server';

setupApiClient();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetSession();
  forgetPendingRefresh();
});
afterAll(() => server.close());
