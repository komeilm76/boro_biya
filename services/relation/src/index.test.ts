import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCorrelationId } from '@boro/contracts';
import { createRelationServer, SERVICE_VERSION } from './index.js';

describe('Relation Service shell', () => {
  it('reports a healthy process with service identity', async () => {
    const app = createRelationServer();
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', service: 'relation', version: '1.0.0' });
    await app.close();
  });

  it('keeps readiness independent from a service domain that does not exist yet', async () => {
    const app = createRelationServer();
    const response = await app.inject({ method: 'GET', url: '/readyz' });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('echoes one bounded correlation identifier on the response', async () => {
    const app = createRelationServer();
    const correlationId = createCorrelationId('test-correlation-12');
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-correlation-id': correlationId },
    });
    expect(response.headers['x-correlation-id']).toBe(correlationId);
    await app.close();
  });

  it('keeps its service version aligned with the workspace manifest', () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'services/relation/package.json'), 'utf8'),
    ) as {
      version: string;
    };
    expect(SERVICE_VERSION).toBe(manifest.version);
  });
});
