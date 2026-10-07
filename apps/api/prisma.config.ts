import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // `prisma generate` (postinstall, CI) needs no database; migrate/deploy fail loudly
    // against this placeholder when DATABASE_URL is missing.
    url: process.env.DATABASE_URL ?? 'postgresql://missing-database-url.invalid:5432/none',
  },
});
