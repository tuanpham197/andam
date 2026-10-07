import { defineConfig } from 'vitest/config';

// Three projects share one coverage report, so `vitest run --coverage`
// measures unit + integration + e2e together against the 100% line gate (NFR-010).
export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/generated/**',
        'src/**/*.spec.ts',
        // CLI entry points: thin wrappers around functions that are tested directly.
        'src/main.ts',
        'src/openapi.ts',
        'src/seed.ts',
        'src/validate-catalog.ts',
      ],
      thresholds: {
        lines: 100,
        'src/modules/*/domain/**': { lines: 100, branches: 100 },
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts', 'test/architecture/**/*.spec.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.spec.ts'],
          globalSetup: ['test/support/postgres.global-setup.ts'],
          setupFiles: ['test/support/env.setup.ts'],
          fileParallelism: false,
          hookTimeout: 120_000,
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.e2e-spec.ts'],
          globalSetup: ['test/support/postgres.global-setup.ts'],
          setupFiles: ['test/support/env.setup.ts'],
          fileParallelism: false,
          hookTimeout: 120_000,
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: { name: 'perf', include: ['test/perf/**/*.perf.ts'] },
      },
    ],
  },
});
