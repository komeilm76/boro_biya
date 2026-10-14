import { describe, expect, it } from 'vitest';
import { createSosServer, SERVICE_VERSION } from './index.js';

describe('SOS Service shell', () => {
  it('reports health without exposing configuration', async () => {
    const app = createSosServer();
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'sos',
      version: SERVICE_VERSION,
      buildCommit: 'unknown',
    });
    expect(response.body).not.toContain('DATABASE_URL');
    await app.close();
  });

  it('keeps the readiness endpoint separate from liveness', async () => {
    const app = createSosServer();
    const live = await app.inject({ method: 'GET', url: '/healthz' });
    const ready = await app.inject({ method: 'GET', url: '/readyz' });
    expect(live.statusCode).toBe(200);
    expect(ready.statusCode).toBe(200);
    await app.close();
  });

  it('does not invent a domain route in the skeleton', async () => {
    const app = createSosServer();
    const response = await app.inject({ method: 'GET', url: '/api/v1/alerts' });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('does not copy an invalid correlation value into the response', async () => {
    const app = createSosServer();
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-correlation-id': 'invalid value' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-correlation-id']).not.toBe('invalid value');
    expect(response.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/i);
    await app.close();
  });
});
