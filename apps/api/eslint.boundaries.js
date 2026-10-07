// Hexagonal dependency rules for apps/api (docs/01-phan-tich-he-thong.md §7.4.6, NFR-012).
// Kept in its own module so test/architecture/boundaries.spec.ts can lint fixtures with it.
import boundaries from 'eslint-plugin-boundaries';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Element patterns below are relative to the repository root, whatever the process cwd is.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

const sameModule = '{{from.element.captured.module}}';

const FRAMEWORK_AND_IO = [
  '@nestjs/*',
  '@prisma/*',
  'express',
  'pg',
  'nestjs-pino',
  'pino',
  'helmet',
];

export const hexagonalBoundaries = {
  files: ['apps/api/src/**/*.ts'],
  plugins: { boundaries },
  settings: {
    'boundaries/root-path': repoRoot,
    'import/resolver': {
      typescript: { project: join(repoRoot, 'apps/api/tsconfig.json'), alwaysTryTypes: true },
    },
    'boundaries/elements': [
      { type: 'generated', pattern: 'apps/api/src/generated' },
      { type: 'kernel', pattern: 'apps/api/src/shared/kernel' },
      { type: 'infrastructure', pattern: 'apps/api/src/shared/infrastructure' },
      { type: 'domain', pattern: 'apps/api/src/modules/*/domain', capture: ['module'] },
      { type: 'application', pattern: 'apps/api/src/modules/*/application', capture: ['module'] },
      { type: 'adapter', pattern: 'apps/api/src/modules/*/adapters', capture: ['module'] },
      // Must stay after the layer folders: only files directly in modules/<name>/ (the Nest module).
      { type: 'module-root', pattern: 'apps/api/src/modules/*', capture: ['module'] },
    ],
  },
  rules: {
    'boundaries/dependencies': [
      'error',
      {
        default: 'allow',
        checkAllOrigins: true,
        policies: [
          {
            from: { element: { type: 'domain' } },
            disallow: {
              to: [
                {
                  element: {
                    type: ['application', 'adapter', 'module-root', 'infrastructure', 'generated'],
                  },
                },
                { element: { type: 'domain', captured: { module: `!${sameModule}` } } },
                { module: { origin: 'external', source: FRAMEWORK_AND_IO } },
              ],
            },
            message:
              'Domain phải là TypeScript thuần: chỉ được import shared/kernel và domain cùng module.',
          },
          {
            from: { element: { type: 'application' } },
            disallow: {
              to: [
                { element: { type: ['adapter', 'module-root', 'infrastructure', 'generated'] } },
                {
                  element: {
                    type: ['domain', 'application'],
                    captured: { module: `!${sameModule}` },
                  },
                },
                { module: { origin: 'external', source: ['@prisma/*', 'express', 'pg'] } },
              ],
            },
            message:
              'Application chỉ phụ thuộc domain cùng module, shared/kernel và port; không dùng Prisma/adapter.',
          },
          {
            from: { element: { type: 'adapter' } },
            disallow: {
              to: {
                element: {
                  type: ['adapter', 'module-root'],
                  captured: { module: `!${sameModule}` },
                },
              },
            },
            message: 'Adapter không được import adapter của module khác; hãy đi qua port.',
          },
        ],
      },
    ],
  },
};
