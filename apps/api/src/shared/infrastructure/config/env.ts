import { z } from 'zod';

const commaSeparatedUrls = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  )
  .pipe(z.array(z.url({ protocol: /^https?$/ })));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'must be a postgresql:// connection string'),
  CORS_ORIGINS: commaSeparatedUrls,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  WEB_BASE_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:5173'),
  // "disabled" runs without a mail server (staging demo): password-reset e-mails are not sent.
  SMTP_URL: z
    .union([z.literal('disabled'), z.url({ protocol: /^smtps?$/ })])
    .default('smtp://localhost:1025'),
  MAIL_FROM: z.string().min(3).default('Thực đơn ăn dặm <no-reply@thucdon.local>'),
  AUTH_RATE_LIMIT: z.coerce.number().int().min(1).default(5),
  API_RATE_LIMIT: z.coerce.number().int().min(1).default(120),
  // Reverse proxies in front of the app (e.g. Vercel rewrite + Render = 2). Rate limits key on
  // the client IP they forward; 0 ignores X-Forwarded-For so it cannot be spoofed.
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  // UC-19 hard deletion of closed accounts runs this often on each instance; 0 turns it off.
  ACCOUNT_PURGE_INTERVAL_MINUTES: z.coerce.number().int().min(0).max(10_080).default(360),
});

export type Env = z.infer<typeof envSchema>;

/** Validates `process.env` at startup; the app refuses to boot with a readable list of problems. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
