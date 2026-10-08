import { inject } from 'vitest';

process.env.DATABASE_URL = inject('databaseUrl');
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.CORS_ORIGINS = 'http://allowed.test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret!';
process.env.WEB_BASE_URL = 'https://thucdon.test';
// High enough that ordinary e2e flows never trip the limiter; rate-limit tests lower it.
process.env.AUTH_RATE_LIMIT = '1000';
process.env.API_RATE_LIMIT = '1000';
// Tests run the purge themselves, at a time they choose.
process.env.ACCOUNT_PURGE_INTERVAL_MINUTES = '0';
