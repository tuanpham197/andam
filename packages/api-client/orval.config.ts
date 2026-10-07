import { defineConfig } from 'orval';

export default defineConfig({
  api: {
    input: '../../apps/api/openapi.json',
    output: {
      mode: 'single',
      target: 'src/generated/api.ts',
      client: 'react-query',
      httpClient: 'fetch',
      clean: true,
      override: {
        mutator: { path: 'src/fetcher.ts', name: 'apiFetch' },
        fetch: { includeHttpResponseReturnType: false },
      },
    },
  },
});
