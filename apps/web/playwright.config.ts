import { defineConfig, devices } from '@playwright/test';

const API_PORT = Number(process.env.E2E_API_PORT ?? 3200);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4300);

/**
 * P7 end-to-end suite (NFR-011, NFR-013, NFR-014): the production build of the web app against
 * a real API and database. `npm run e2e -w @appandam/web` (needs `npm run db:up`).
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'retain-on-failure',
    // The service worker would serve a cached shell between tests.
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Pixel 7'] } },
    { name: 'webkit', use: { ...devices['iPhone 14'] } },
  ],
  webServer: [
    {
      command: './e2e/start-api.sh',
      url: `http://localhost:${API_PORT}/api/v1/health`,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
    },
    {
      command: `npx vite build && npx vite preview --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
});
