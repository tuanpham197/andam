import { Controller, Get, type INestApplication } from '@nestjs/common';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { bootstrap, createApp } from '../../src/bootstrap.js';
import { DATABASE_HEALTH } from '../../src/modules/health/application/ports/out/database-health.port.js';
import { exportOpenApi } from '../../src/openapi/openapi-document.js';
import { Public } from '../../src/shared/auth/public.decorator.js';
import { createTestApp } from '../support/app.js';

@Public()
@Controller('boom')
class BoomController {
  @Get()
  explode(): never {
    throw new Error('connect ECONNREFUSED 10.0.0.5:5432 password=secret');
  }
}

async function appWith(options: { controllers?: never[]; databaseUp?: boolean } = {}) {
  return createTestApp({
    controllers: options.controllers,
    overrides: options.databaseUp === false ? [[DATABASE_HEALTH, { ping: async () => false }]] : [],
  });
}

describe('HTTP platform (P0)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await appWith({ controllers: [BoomController as never] });
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe('GET /api/v1/health', () => {
    it('answers 200 with the database status', async () => {
      const res = await http().get('/api/v1/health').expect(200);
      expect(res.body).toEqual({ status: 'ok', checks: { database: 'up' } });
    });

    it('TC-API-004 answers 503 problem details when the database is down', async () => {
      const downApp = await appWith({ databaseUp: false });
      const res = await request(downApp.getHttpServer()).get('/api/v1/health').expect(503);
      expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
      expect(res.body).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
      await downApp.close();
    });

    it('is only served under the /api/v1 prefix', async () => {
      await http().get('/health').expect(404);
    });
  });

  it('TC-API-003 answers unknown routes with 404 problem details', async () => {
    const res = await http().get('/api/v1/khong-ton-tai').expect(404);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.body).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      instance: '/api/v1/khong-ton-tai',
    });
  });

  it('TC-API-001 rejects malformed JSON with 400 problem details', async () => {
    const res = await http()
      .post('/api/v1/health')
      .set('content-type', 'application/json')
      .send('{"name": ')
      .expect(400);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.body).toMatchObject({ status: 400, code: 'MALFORMED_JSON' });
  });

  it('rejects a malformed percent-encoded path with 400 instead of crashing', async () => {
    const res = await http().get('/api/v1/health/%FF').expect(400);
    expect(res.body).toMatchObject({ status: 400, code: 'BAD_REQUEST' });
  });

  it('TC-API-002 rejects bodies above 100 KB with 413', async () => {
    const res = await http()
      .post('/api/v1/health')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ note: 'x'.repeat(101 * 1024) }))
      .expect(413);
    expect(res.body).toMatchObject({ status: 413, code: 'PAYLOAD_TOO_LARGE' });
  });

  it('accepts a body just under the limit', async () => {
    await http()
      .post('/api/v1/health')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ note: 'x'.repeat(99 * 1024) }))
      .expect(404);
  });

  it('TC-API-005 answers unexpected errors with a generic 500', async () => {
    const res = await http().get('/api/v1/boom').expect(500);
    expect(res.body).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      code: 'INTERNAL_ERROR',
      instance: '/api/v1/boom',
    });
    expect(res.text).not.toMatch(/ECONNREFUSED|secret|at /);
  });

  describe('TC-API-006 CORS', () => {
    it('allows a configured origin with credentials', async () => {
      const res = await http()
        .get('/api/v1/health')
        .set('Origin', 'http://allowed.test')
        .expect(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://allowed.test');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('does not allow an unknown origin', async () => {
      const res = await http().get('/api/v1/health').set('Origin', 'http://evil.test');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  it('TC-API-007 sends security headers and hides the framework', async () => {
    const res = await http().get('/api/v1/health');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  describe('OpenAPI', () => {
    it('serves the document outside production', async () => {
      const res = await http().get('/api/docs-json').expect(200);
      expect(res.body.info.title).toBe('App thực đơn ăn dặm API');
      expect(Object.keys(res.body.paths)).toContain('/api/v1/health');
    });

    it('does not serve docs in production', async () => {
      const prodApp = await createTestApp({ env: { NODE_ENV: 'production' } });
      await request(prodApp.getHttpServer()).get('/api/docs-json').expect(404);
      await prodApp.close();
    });

    it('exports the document to a file for the web client generator', async () => {
      const file = join(await mkdtemp(join(tmpdir(), 'openapi-')), 'openapi.json');
      await exportOpenApi(file);
      const document = JSON.parse(await readFile(file, 'utf8'));
      expect(document.openapi).toMatch(/^3\./);
      expect(Object.keys(document.paths)).toContain('/api/v1/health');
    });
  });

  describe('bootstrap', () => {
    it('createApp builds a configured application without listening', async () => {
      const created = await createApp();
      await created.init();
      await request(created.getHttpServer()).get('/api/v1/health').expect(200);
      await created.close();
    });

    it('bootstrap listens on the configured port', async () => {
      const previous = process.env.PORT;
      process.env.PORT = '0';
      try {
        const running = await bootstrap();
        const address = running.getHttpServer().address();
        expect(typeof address === 'object' && address !== null && address.port).toBeGreaterThan(0);
        await running.close();
      } finally {
        process.env.PORT = previous;
      }
    });
  });
});
