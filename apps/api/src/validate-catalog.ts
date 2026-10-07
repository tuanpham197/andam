import { checkRepositoryCatalog } from './modules/catalog/adapters/out/files/catalog-cli.js';

const problems = await checkRepositoryCatalog({
  production: process.argv.includes('--production'),
});
for (const problem of problems) console.error(`✗ ${problem}`);
process.exitCode = problems.length > 0 ? 1 : 0;
