import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeCapturedLog, makeServerConfigFixture } from '@boro-biya/test-utils';
import { errorEnvelopeSchema, healthResponseSchema, readyResponseSchema } from '@boro-biya/validation';
import { createLogger } from '@boro-biya/server-runtime';
import { createMetricsRegistry } from '@boro-biya/server-runtime';
import { buildApp } from '../../src/app.js';

const apps: FastifyInstance[] = [];

function buildTestApp(readiness?: () => Promise<boolean>) {
  const capture = makeCapturedLog();
  const config = makeServerConfigFixture({ buildCommit: 'unit-test-commit' });
  const app = buildApp({
    config,
    logger: createLogger({
      service: config.service,
      version: '0.1.0',
      commit: config.buildCommit,
      level: 'debug',
      sink: capture.sink,
    }),
    registry: createMetricsRegistry(),
    ...(readiness !== undefined ? { readiness } : {}),
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

describe('core API skeleton (OPS-02)', () => {
  it('reports liveness with build metadata and a contract timestamp', async () => {
    const { app } = buildTestApp(() => Promise.resolve(false));
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    const health = healthResponseSchema.parse(response.json());
    expect(health.service).toBe('api');
    expect(health.commit).toBe('unit-test-commit'); // OPS-61
    expect(health.serverTime.endsWith('Z')).toBe(true); // API-36
    // Liveness ignored the failing readiness probe entirely (OPS-59: no dependency checks).
  });

  it('answers HEAD on liveness like GET', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: 'HEAD', url: '/healthz' });
    expect(response.statusCode).toBe(200);
  });

  it('reports readiness from the injected dependency state (GOV-61 seam)', async () => {
    const up = buildTestApp(() => Promise.resolve(true));
    const upResponse = await up.app.inject({ method: 'GET', url: '/readyz' });
    expect(upResponse.statusCode).toBe(200);
    expect(readyResponseSchema.parse(upResponse.json()).checks).toEqual({ database: true });

    const down = buildTestApp(() => Promise.resolve(false));
    const downResponse = await down.app.inject({ method: 'GET', url: '/readyz' });
    expect(downResponse.statusCode).toBe(503);
    expect(readyResponseSchema.parse(downResponse.json())).toMatchObject({ status: 'unavailable' });
  });

  it('has no /api/v1 business routes in Phase 1 — unknown paths get the envelope (GOV-02, API-11)', async () => {
    const { app } = buildTestApp();
    for (const url of ['/api/v1/auth/login', '/api/v1/relation/follows', '/api/v1/sos/alerts']) {
      const response = await app.inject({ method: 'POST', url, payload: {} });
      expect(response.statusCode).toBe(404);
      const envelope = errorEnvelopeSchema.parse(response.json());
      expect(envelope.code).toBe('not_found');
      expect(response.body).not.toContain('stack');
    }
  });

  it('logs one structured line per request with the correlation identifier (SEC-57, SEC-73)', async () => {
    const { app, capture } = buildTestApp();
    await app.inject({ method: 'GET', url: '/healthz', headers: { 'x-correlation-id': 'unit-test-correlation-01' } });
    const completion = capture.lines().find((line) => line['msg'] === 'request completed');
    expect(completion).toBeDefined();
    expect(completion?.['correlationId']).toBe('unit-test-correlation-01');
    expect(completion?.['route']).toBe('/healthz');
    expect(completion?.['status']).toBe(200);
  });
});
