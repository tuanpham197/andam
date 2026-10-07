import { ESLint } from 'eslint';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';
import { hexagonalBoundaries } from '../../eslint.boundaries.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

const eslint = new ESLint({
  cwd: repoRoot,
  overrideConfigFile: true,
  overrideConfig: [
    { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
    hexagonalBoundaries,
  ],
});

async function violations(fileInSrc: string, importPath: string) {
  const [result] = await eslint.lintText(`import '${importPath}';\n`, {
    filePath: join(repoRoot, 'apps/api/src', fileInSrc),
  });
  return result!.messages.filter((m) => m.ruleId === 'boundaries/dependencies');
}

describe('hexagonal boundaries (NFR-012)', () => {
  describe('TC-ARC-001 domain stays framework-free', () => {
    it.each(['@prisma/client', '@nestjs/common', '@prisma/adapter-pg', 'express', 'pg'])(
      'rejects %s in domain',
      async (source) => {
        const found = await violations('modules/health/domain/fixture.ts', source);
        expect(found).toHaveLength(1);
        expect(found[0]!.message).toMatch(/Domain phải là TypeScript thuần/);
      },
    );

    it('rejects application code in domain', async () => {
      expect(
        await violations(
          'modules/health/domain/fixture.ts',
          '../application/use-cases/check-health.service.js',
        ),
      ).toHaveLength(1);
    });

    it('rejects infrastructure in domain', async () => {
      expect(
        await violations(
          'modules/health/domain/fixture.ts',
          '../../../shared/infrastructure/prisma/prisma.service.js',
        ),
      ).toHaveLength(1);
    });

    it('allows the shared kernel in domain', async () => {
      expect(
        await violations(
          'modules/health/domain/fixture.ts',
          '../../../shared/kernel/domain-error.js',
        ),
      ).toHaveLength(0);
    });
  });

  describe('application layer', () => {
    it('rejects Prisma', async () => {
      expect(
        await violations('modules/health/application/fixture.ts', '@prisma/client'),
      ).toHaveLength(1);
    });

    it('rejects adapters and infrastructure', async () => {
      expect(
        await violations(
          'modules/health/application/fixture.ts',
          '../adapters/out/persistence/prisma-database-health.adapter.js',
        ),
      ).toHaveLength(1);
      expect(
        await violations(
          'modules/health/application/fixture.ts',
          '../../../shared/infrastructure/prisma/prisma.service.js',
        ),
      ).toHaveLength(1);
    });

    it('allows NestJS DI decorators', async () => {
      expect(
        await violations('modules/health/application/fixture.ts', '@nestjs/common'),
      ).toHaveLength(0);
    });
  });

  describe('TC-ARC-002 adapters', () => {
    it("rejects another module's adapter", async () => {
      const found = await violations(
        'modules/meal-planning/adapters/fixture.ts',
        '../../health/adapters/out/persistence/prisma-database-health.adapter.js',
      );
      expect(found).toHaveLength(1);
      expect(found[0]!.message).toMatch(/Adapter không được import adapter của module khác/);
    });

    it("rejects another module's Nest module file", async () => {
      expect(
        await violations(
          'modules/meal-planning/adapters/fixture.ts',
          '../../health/health.module.js',
        ),
      ).toHaveLength(1);
    });

    it('allows their own application layer and infrastructure', async () => {
      expect(
        await violations(
          'modules/health/adapters/fixture.ts',
          '../application/use-cases/check-health.service.js',
        ),
      ).toHaveLength(0);
      expect(
        await violations(
          'modules/health/adapters/fixture.ts',
          '../../../shared/infrastructure/prisma/prisma.service.js',
        ),
      ).toHaveLength(0);
    });
  });
});
