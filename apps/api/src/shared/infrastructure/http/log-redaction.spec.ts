import { redactPath, serializeRequest } from './log-redaction.js';

describe('log redaction (TC-FAM-026)', () => {
  it('hides invite tokens in the path, keeping the rest', () => {
    expect(redactPath('/api/v1/invites/abc-DEF_123')).toBe('/api/v1/invites/[redacted]');
    expect(redactPath('/api/v1/invites/abc/accept?x=1')).toBe(
      '/api/v1/invites/[redacted]/accept?x=1',
    );
    expect(redactPath('/api/v1/children/1/invites/2')).toBe(
      '/api/v1/children/1/invites/[redacted]',
    );
    expect(redactPath('/api/v1/health')).toBe('/api/v1/health');
  });

  it('serializes a request without the token, nor the params that repeat it', () => {
    expect(
      serializeRequest({ id: 1, url: '/api/v1/invites/secret', params: { splat: ['secret'] } }),
    ).toEqual({ id: 1, url: '/api/v1/invites/[redacted]', params: undefined });
    expect(serializeRequest({ id: 2 })).toEqual({ id: 2, url: undefined, params: undefined });
  });
});
