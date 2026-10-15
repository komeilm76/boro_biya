import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeCapturedLog, makeServerConfigFixture } from '@boro-biya/test-utils';
import { healthResponseSchema } from '@boro-biya/validation';
import { createLogger, createMetricsRegistry } from '@boro-biya/server-runtime';
import { buildApp } from '../../src/app.js';

const apps: FastifyInstance[] = [];

function buildTestApp() {
  const capture = makeCapturedLog();
  const config = makeServerConfigFixture({ service: 'relation', apiPort: 3001, metricsPort: 9001 });
  const app = buildApp({
    config,
    logger: createLogger({ service: config.service, version: '0.1.0', level: 'info', sink: capture.sink }),
    registry: createMetricsRegistry(),
    readiness: () => Promise.resolve(true),
  });
  apps.push(app);
  return { app, capture };
}

afterEach(async () => {
  while (apps.length > 0) {
    const app = apps.pop();
    await app?.close();
  }
});

describe('Relation Service skeleton (OPS-03)', () => {
  it('identifies itself as the relation service on liveness', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(healthResponseSchema.parse(response.json()).service).toBe('relation');
  });

  it('has no /relation/* domain routes yet (PLG-35: they arrive in Phase 4)', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/relation/follows' });
    expect(response.statusCode).toBe(404);
  });
});
