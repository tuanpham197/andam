import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MAILER } from '../../src/modules/identity/application/ports/out/mailer.port.js';
import { CURRENT_CONSENT_VERSION } from '../../src/modules/identity/domain/consent.js';
import { REUSE_GRACE_MS } from '../../src/modules/identity/domain/refresh-token.js';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service.js';
import { CLOCK } from '../../src/shared/kernel/clock.port.js';
import { RecordingMailer } from '../fakes/identity.js';
import { FixedClock } from '../fakes/kernel.js';
import { createTestApp } from '../support/app.js';
import { resetDatabase } from '../support/database.js';

const PASSWORD = 'Cháo cá hồi 2026';
const mailer = new RecordingMailer();
const clock = new FixedClock();
let app: INestApplication;

beforeAll(async () => {
  app = await createTestApp({
    overrides: [
      [MAILER, mailer],
      [CLOCK, clock],
    ],
  });
});
beforeEach(async () => {
  await resetDatabase(app.get(PrismaService));
  mailer.sent.length = 0;
  clock.set('2026-09-28T03:00:00Z');
});
afterAll(() => app.close());

const http = () => request(app.getHttpServer());

function register(body: Record<string, unknown> = {}) {
  return http()
    .post('/api/v1/auth/register')
    .send({
      email: 'na@example.vn',
      password: PASSWORD,
      consentVersion: CURRENT_CONSENT_VERSION,
      ...body,
    });
}

function login(email = 'na@example.vn', password = PASSWORD) {
  return http().post('/api/v1/auth/login').send({ email, password });
}

function setCookies(res: request.Response): string[] {
  const header = res.headers['set-cookie'] as string | string[] | undefined;
  return ([] as string[]).concat(header ?? []);
}

function refreshCookie(res: request.Response): string {
  const cookie = setCookies(res).find((c) => c.startsWith('refresh_token='));
  if (!cookie) throw new Error('no refresh cookie');
  return cookie.split(';')[0]!;
}

describe('POST /api/v1/auth/register', () => {
  it('TC-AUTH-001 answers 201 with an access token and a hardened refresh cookie', async () => {
    const res = await register().expect(201);

    expect(res.body).toEqual({
      userId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      accessToken: expect.any(String),
      accessTokenExpiresAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    const cookie = setCookies(res).join(';');
    expect(cookie).toMatch(/refresh_token=[A-Za-z0-9_-]{43}/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    // TC-AUTH-024: the cookie only travels to the auth endpoints.
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    expect(res.body).not.toHaveProperty('refreshToken');
  });

  it('TC-AUTH-002 answers 409 EMAIL_TAKEN for the same e-mail in another case', async () => {
    await register().expect(201);
    const res = await register({ email: 'NA@EXAMPLE.VN' }).expect(409);
    expect(res.body).toMatchObject({ code: 'EMAIL_TAKEN' });
  });

  it.each([
    ['invalid e-mail', { email: 'a@' }, 400, 'INVALID_EMAIL'],
    ['short password', { password: 'Abc!234' }, 400, 'PASSWORD_TOO_SHORT'],
    ['long password', { password: `Xy!${'k'.repeat(126)}` }, 400, 'PASSWORD_TOO_LONG'],
    ['common password', { password: '12345678' }, 422, 'WEAK_PASSWORD'],
    ['missing consent', { consentVersion: undefined }, 422, 'CONSENT_REQUIRED'],
    ['old consent', { consentVersion: '2020-01-01' }, 422, 'CONSENT_REQUIRED'],
    ['e-mail not a string', { email: 42 }, 400, 'VALIDATION_FAILED'],
    ['password not a string', { password: ['x'] }, 400, 'VALIDATION_FAILED'],
    ['e-mail over 254 chars', { email: `${'a'.repeat(250)}@b.vn` }, 400, 'VALIDATION_FAILED'],
    ['unknown field (X6)', { isAdmin: true }, 400, 'VALIDATION_FAILED'],
  ])('rejects %s with %i %s', async (_label, body, status, code) => {
    const res = await register(body).expect(status);
    expect(res.body).toMatchObject({ status, code });
  });
});

describe('POST /api/v1/auth/login', () => {
  it('answers 200 with a session for the right credentials', async () => {
    await register();
    const res = await login(' NA@example.vn ').expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(refreshCookie(res)).toMatch(/^refresh_token=/);
  });

  it('TC-AUTH-009 answers identically for a wrong password and an unknown e-mail', async () => {
    await register();
    const wrong = await login('na@example.vn', 'wrong password').expect(401);
    const unknown = await login('ghost@example.vn').expect(401);
    const { instance: _a, ...wrongBody } = wrong.body;
    const { instance: _b, ...unknownBody } = unknown.body;
    expect(wrongBody).toEqual(unknownBody);
    expect(wrongBody).toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('TC-AUTH-010 locks the account after 5 failures, even for the right password', async () => {
    await register();
    for (let i = 0; i < 5; i += 1) await login('na@example.vn', 'wrong password').expect(401);
    const res = await login().expect(429);
    expect(res.body).toMatchObject({ code: 'TOO_MANY_ATTEMPTS' });
  });

  it('rejects a missing body with 400', async () => {
    await http().post('/api/v1/auth/login').send({}).expect(400);
  });
});

describe('GET /api/v1/me', () => {
  it('returns the profile for a valid access token', async () => {
    const { body } = await register();
    const res = await http()
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200);
    expect(res.body).toEqual({
      id: body.userId,
      email: 'na@example.vn',
      timezone: 'Asia/Ho_Chi_Minh',
      displayName: null,
      createdAt: expect.any(String),
    });
  });

  it.each([
    ['no header', undefined],
    ['empty bearer', 'Bearer '],
    ['wrong scheme', 'Token abc'],
    ['garbage token', 'Bearer not.a.jwt'],
  ])('TC-AUTH-012 answers 401 UNAUTHENTICATED with %s', async (_label, header) => {
    const req = http().get('/api/v1/me');
    if (header) req.set('Authorization', header);
    const res = await req.expect(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('TC-AUTH-012 rejects a token whose payload was edited', async () => {
    const { body } = await register();
    const [header, , signature] = (body.accessToken as string).split('.');
    const forged = Buffer.from(JSON.stringify({ sub: body.userId, exp: 9999999999 })).toString(
      'base64url',
    );
    await http()
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${header}.${forged}.${signature}`)
      .expect(401);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('TC-AUTH-013 rotates the refresh cookie and issues a new access token', async () => {
    const first = await register();
    const res = await http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', refreshCookie(first))
      .expect(200);
    expect(res.body.accessToken).not.toBe(first.body.accessToken);
    expect(refreshCookie(res)).not.toBe(refreshCookie(first));
  });

  it('TC-AUTH-014 revokes the family when an old cookie is replayed after the grace period', async () => {
    const first = await register();
    const second = await http().post('/api/v1/auth/refresh').set('Cookie', refreshCookie(first));
    clock.advance(REUSE_GRACE_MS + 1);

    const replay = await http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', refreshCookie(first))
      .expect(401);
    expect(replay.body).toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
    await http().post('/api/v1/auth/refresh').set('Cookie', refreshCookie(second)).expect(401);
  });

  it('TC-AUTH-029 lets a second tab refresh with the same cookie within 10 seconds', async () => {
    const first = await register();
    await http().post('/api/v1/auth/refresh').set('Cookie', refreshCookie(first)).expect(200);
    clock.advance(REUSE_GRACE_MS);
    await http().post('/api/v1/auth/refresh').set('Cookie', refreshCookie(first)).expect(200);
  });

  it('answers 401 without a cookie', async () => {
    await http().post('/api/v1/auth/refresh').expect(401);
  });

  it('TC-AUTH-025 serves two simultaneous refreshes with the same cookie (two tabs opening)', async () => {
    const first = await register();
    const statuses = await Promise.all(
      [1, 2].map(
        async () =>
          (await http().post('/api/v1/auth/refresh').set('Cookie', refreshCookie(first))).status,
      ),
    );
    expect(statuses).toEqual([200, 200]);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('TC-AUTH-017 revokes the session, clears the cookie and is idempotent', async () => {
    const session = await register();
    const res = await http()
      .post('/api/v1/auth/logout')
      .set('Cookie', refreshCookie(session))
      .expect(204);
    expect(setCookies(res).join(';')).toMatch(/refresh_token=;.*Expires=Thu, 01 Jan 1970/);
    await http().post('/api/v1/auth/refresh').set('Cookie', refreshCookie(session)).expect(401);
    await http().post('/api/v1/auth/logout').set('Cookie', refreshCookie(session)).expect(204);
    await http().post('/api/v1/auth/logout').expect(204);
  });
});

describe('password reset', () => {
  it('mails a link whose token sets a new password once', async () => {
    await register();
    await http().post('/api/v1/auth/forgot-password').send({ email: 'na@example.vn' }).expect(202);
    const token = new URL(mailer.sent[0]!.resetUrl).searchParams.get('token');
    expect(mailer.sent[0]!.resetUrl).toMatch(/^https:\/\/thucdon\.test\/reset-password\?token=/);

    await http()
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'Bột yến mạch chuối!' })
      .expect(204);
    await login('na@example.vn', 'Bột yến mạch chuối!').expect(200);
    const reuse = await http()
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'Another password 42' })
      .expect(400);
    expect(reuse.body).toMatchObject({ code: 'RESET_TOKEN_INVALID' });
  });

  it('TC-AUTH-018 answers 202 for an unknown e-mail without sending anything', async () => {
    await http()
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'ghost@example.vn' })
      .expect(202);
    expect(mailer.sent).toHaveLength(0);
  });
});

describe('DELETE /api/v1/me', () => {
  it('TC-AUTH-021 refuses the wrong password', async () => {
    const { body } = await register();
    const res = await http()
      .delete('/api/v1/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .send({ password: 'wrong password' })
      .expect(401);
    expect(res.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('TC-AUTH-022 deletes the account: the still-valid access token stops working', async () => {
    const session = await register();
    const auth = `Bearer ${session.body.accessToken}`;
    await http()
      .delete('/api/v1/me')
      .set('Authorization', auth)
      .send({ password: PASSWORD })
      .expect(204);

    await http().get('/api/v1/me').set('Authorization', auth).expect(401);
    await login().expect(401);
    await http().post('/api/v1/auth/refresh').set('Cookie', refreshCookie(session)).expect(401);
  });

  it('requires authentication', async () => {
    await http().delete('/api/v1/me').send({ password: PASSWORD }).expect(401);
  });
});

describe('TC-AUTH-023 rate limiting', () => {
  let limited: INestApplication;

  beforeAll(async () => {
    limited = await createTestApp({ env: { AUTH_RATE_LIMIT: '5', API_RATE_LIMIT: '8' } });
  });
  afterAll(() => limited.close());

  it('allows 5 auth requests per minute per IP and blocks the 6th with Retry-After', async () => {
    const attempt = () =>
      request(limited.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'x@example.vn', password: 'whatever pw' });
    for (let i = 0; i < 5; i += 1) await attempt().expect(401);
    const blocked = await attempt().expect(429);
    expect(blocked.body).toMatchObject({ status: 429, code: 'TOO_MANY_REQUESTS' });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('applies the higher general limit to other routes', async () => {
    const server = limited.getHttpServer();
    for (let i = 0; i < 8; i += 1) await request(server).get('/api/v1/health').expect(200);
    await request(server).get('/api/v1/health').expect(429);
  });
});

describe('rate limiting behind reverse proxies (TRUST_PROXY)', () => {
  const login = (target: INestApplication, forwardedFor: string) =>
    request(target.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', forwardedFor)
      .send({ email: 'x@example.vn', password: 'whatever pw' });

  it('ignores X-Forwarded-For by default, so a client cannot dodge the limit by forging it', async () => {
    const direct = await createTestApp({ env: { AUTH_RATE_LIMIT: '2' } });
    try {
      await login(direct, '203.0.113.1').expect(401);
      await login(direct, '203.0.113.2').expect(401);
      await login(direct, '203.0.113.3').expect(429);
    } finally {
      await direct.close();
    }
  });

  it('limits each client IP the proxies forward, not the proxy itself', async () => {
    // Vercel rewrite → Render → app: the header reads "client, vercel-edge".
    const proxied = await createTestApp({ env: { AUTH_RATE_LIMIT: '2', TRUST_PROXY: '2' } });
    try {
      for (let i = 0; i < 2; i += 1) await login(proxied, '203.0.113.1, 198.51.100.7').expect(401);
      await login(proxied, '203.0.113.1, 198.51.100.7').expect(429);
      // Another parent behind the same proxy still gets in.
      await login(proxied, '203.0.113.2, 198.51.100.7').expect(401);
    } finally {
      await proxied.close();
    }
  });
});
