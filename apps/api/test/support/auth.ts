import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CURRENT_CONSENT_VERSION } from '../../src/modules/identity/domain/consent.js';

/** Registers a fresh user and returns its Authorization header value. */
export async function signUp(app: INestApplication, email = `${randomUUID()}@example.vn`) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ email, password: 'Cháo cá hồi 2026', consentVersion: CURRENT_CONSENT_VERSION })
    .expect(201);
  return {
    authorization: `Bearer ${res.body.accessToken as string}`,
    userId: res.body.userId as string,
  };
}
