import { validateEnv } from './env.js';

const SECRET = 'x'.repeat(32);

const valid = {
  NODE_ENV: 'development',
  PORT: '3000',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  CORS_ORIGINS: 'http://localhost:5173',
  LOG_LEVEL: 'info',
  JWT_SECRET: SECRET,
  WEB_BASE_URL: 'https://thucdon.vn',
  SMTP_URL: 'smtp://mail.thucdon.vn:587',
  MAIL_FROM: 'Thực đơn <no-reply@thucdon.vn>',
  AUTH_RATE_LIMIT: '10',
  API_RATE_LIMIT: '200',
  TRUST_PROXY: '2',
};

describe('validateEnv', () => {
  it('parses a complete environment', () => {
    expect(validateEnv(valid)).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      CORS_ORIGINS: ['http://localhost:5173'],
      LOG_LEVEL: 'info',
      JWT_SECRET: SECRET,
      WEB_BASE_URL: 'https://thucdon.vn',
      SMTP_URL: 'smtp://mail.thucdon.vn:587',
      MAIL_FROM: 'Thực đơn <no-reply@thucdon.vn>',
      AUTH_RATE_LIMIT: 10,
      API_RATE_LIMIT: 200,
      TRUST_PROXY: 2,
    });
  });

  it('applies defaults for optional variables', () => {
    expect(validateEnv({ DATABASE_URL: valid.DATABASE_URL, JWT_SECRET: SECRET })).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: valid.DATABASE_URL,
      CORS_ORIGINS: [],
      LOG_LEVEL: 'info',
      JWT_SECRET: SECRET,
      WEB_BASE_URL: 'http://localhost:5173',
      SMTP_URL: 'smtp://localhost:1025',
      MAIL_FROM: 'Thực đơn ăn dặm <no-reply@thucdon.local>',
      AUTH_RATE_LIMIT: 5,
      API_RATE_LIMIT: 120,
      TRUST_PROXY: 0,
    });
  });

  it('splits CORS_ORIGINS on commas and drops blanks and surrounding spaces', () => {
    const env = validateEnv({ ...valid, CORS_ORIGINS: ' https://a.vn , ,https://b.vn,' });
    expect(env.CORS_ORIGINS).toEqual(['https://a.vn', 'https://b.vn']);
  });

  it('accepts PORT=0 so tests can bind a random port', () => {
    expect(validateEnv({ ...valid, PORT: '0' }).PORT).toBe(0);
  });

  it('accepts SMTP_URL=disabled to run without a mail server', () => {
    expect(validateEnv({ ...valid, SMTP_URL: 'disabled' }).SMTP_URL).toBe('disabled');
  });

  it('accepts a JWT secret of exactly 32 characters', () => {
    expect(validateEnv(valid).JWT_SECRET).toHaveLength(32);
  });

  describe('TC-API-010 rejects a missing or malformed environment with a readable message', () => {
    it.each([
      ['DATABASE_URL missing', { ...valid, DATABASE_URL: undefined }, 'DATABASE_URL'],
      ['DATABASE_URL empty', { ...valid, DATABASE_URL: '' }, 'DATABASE_URL'],
      ['DATABASE_URL not postgres', { ...valid, DATABASE_URL: 'mysql://x' }, 'DATABASE_URL'],
      ['PORT not a number', { ...valid, PORT: 'abc' }, 'PORT'],
      ['PORT negative', { ...valid, PORT: '-1' }, 'PORT'],
      ['PORT above 65535', { ...valid, PORT: '65536' }, 'PORT'],
      ['PORT fractional', { ...valid, PORT: '3000.5' }, 'PORT'],
      ['NODE_ENV unknown', { ...valid, NODE_ENV: 'staging' }, 'NODE_ENV'],
      ['LOG_LEVEL unknown', { ...valid, LOG_LEVEL: 'verbose' }, 'LOG_LEVEL'],
      ['CORS origin not a URL', { ...valid, CORS_ORIGINS: 'localhost:5173' }, 'CORS_ORIGINS'],
      ['JWT_SECRET missing', { ...valid, JWT_SECRET: undefined }, 'JWT_SECRET'],
      ['JWT_SECRET of 31 chars', { ...valid, JWT_SECRET: 'x'.repeat(31) }, 'JWT_SECRET'],
      ['WEB_BASE_URL not a URL', { ...valid, WEB_BASE_URL: 'thucdon.vn' }, 'WEB_BASE_URL'],
      ['SMTP_URL not smtp', { ...valid, SMTP_URL: 'http://mail' }, 'SMTP_URL'],
      ['SMTP_URL another word', { ...valid, SMTP_URL: 'off' }, 'SMTP_URL'],
      ['TRUST_PROXY negative', { ...valid, TRUST_PROXY: '-1' }, 'TRUST_PROXY'],
      ['TRUST_PROXY true', { ...valid, TRUST_PROXY: 'true' }, 'TRUST_PROXY'],
      ['AUTH_RATE_LIMIT zero', { ...valid, AUTH_RATE_LIMIT: '0' }, 'AUTH_RATE_LIMIT'],
      ['API_RATE_LIMIT not a number', { ...valid, API_RATE_LIMIT: 'many' }, 'API_RATE_LIMIT'],
    ])('%s', (_label, raw, variable) => {
      expect(() => validateEnv(raw)).toThrowError(
        new RegExp(`Invalid environment configuration:[\\s\\S]*${variable}`),
      );
    });

    it('lists every invalid variable at once', () => {
      expect(() => validateEnv({ PORT: 'x' })).toThrowError(
        /DATABASE_URL[\s\S]*PORT|PORT[\s\S]*DATABASE_URL/,
      );
    });
  });
});
