import type { DatabaseHealthPort } from '../ports/out/database-health.port.js';
import { CheckHealthService } from './check-health.service.js';

function withDatabase(ping: DatabaseHealthPort['ping']) {
  return new CheckHealthService({ ping });
}

describe('CheckHealthService', () => {
  it('reports ok when the database answers', async () => {
    await expect(withDatabase(async () => true).execute()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
  });

  it('TC-API-004 reports error when the database does not answer', async () => {
    await expect(withDatabase(async () => false).execute()).resolves.toEqual({
      status: 'error',
      checks: { database: 'down' },
    });
  });

  it('treats a ping that throws as down instead of failing the health check', async () => {
    const result = await withDatabase(async () => {
      throw new Error('socket hang up');
    }).execute();
    expect(result).toEqual({ status: 'error', checks: { database: 'down' } });
  });
});
