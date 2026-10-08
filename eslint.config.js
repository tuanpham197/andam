import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { hexagonalBoundaries } from './apps/api/eslint.boundaries.js';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      'design/**',
      // k6 scripts run in k6's runtime, not Node.
      'load/**',
      'apps/api/src/generated/**',
      'packages/api-client/src/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: [
      'apps/api/**/*.{ts,js}',
      '*.js',
      'packages/**/*.{ts,js}',
      'apps/web/scripts/**',
      'apps/web/e2e/**',
      'apps/web/playwright.config.ts',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/*.test.{ts,tsx}'],
    languageOptions: { globals: globals.vitest },
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  hexagonalBoundaries,
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    rules: reactHooks.configs.recommended.rules,
  },
  prettier,
);
