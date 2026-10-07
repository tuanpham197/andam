import 'dotenv/config';
import { seedRepositoryCatalog } from './modules/catalog/adapters/out/files/catalog-cli.js';
import { validateEnv } from './shared/infrastructure/config/env.js';
import { PrismaService } from './shared/infrastructure/prisma/prisma.service.js';

const env = validateEnv(process.env);
const prisma = new PrismaService(env);
// Staging runs as production but may carry draft (unreviewed) dishes: `node dist/seed.js --allow-draft`.
const production = env.NODE_ENV === 'production' && !process.argv.includes('--allow-draft');
await seedRepositoryCatalog(prisma, { production }).finally(() => prisma.$disconnect());
