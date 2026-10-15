import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES, INTERNAL_ERROR_MESSAGE, type ErrorEnvelope } from '@boro-biya/contracts';
import { errorEnvelopeSchema, healthResponseSchema, readyResponseSchema } from '@boro-biya/validation';
import { applyCors, applySecurityHeaders } from '../../src/http-headers.js';
import { applyErrorEnvelope } from '../../src/envelope.js';
import { applyHealthRoutes } from '../../src/health.js';
import { applyObservability, createRequestCounter } from '../../src/observability.js';
import { createLogger } from '../../src/logger.js';
import { createMetricsRegistry } from '../../src/metrics.js';

interface Harness {
  app: FastifyInstance;
  raw: string[];
  lines(): Array<Record<string, unknown>>;
  registry: ReturnType<typeof createMetricsRegistry>;
}

const apps: FastifyInstance[] = [];

function buildHarness(options?: {
  readiness?: () => Promise<boolean>;
  readinessTimeoutMs?: number;
  origins?: string[];
}): Harness {
  const raw: string[] = [];
  const logger = createLogger({
    service: 'api',
    version: '0.1.0',
    commit: 'test',
    level: 'debug',
    sink: (line) => raw.push(line),
  });
  const registry = createMetricsRegistry();
  const app = Fastify({ logger: false });
  apps.push(app);
  applyObservability(app, { logger, registry, service: 'api', requestCounter: createRequestCounter(registry) });
  applySecurityHeaders(app);
  applyCors(app, options?.origins ?? []);
  applyErrorEnvelope(app, { logger });
  applyHealthRoutes(app, {
    service: 'api',
    version: '0.1.0',
    commit: 'test',
    ...(options?.readiness !== undefined ? { readiness: options.readiness } : {}),
    ...(options?.readinessTimeoutMs !== undefined ? { readinessTimeoutMs: options.readinessTimeoutMs } : {}),
  });
  return { app, raw, lines: () => raw.map((line) => JSON.parse(line) as Record<string, unknown>), registry };
}

afterEach(async () => {
  while (apps.length > 0) {
    const app = apps.pop();
    await app?.close();
  }
});

describe('health routes (OPS-59 … OPS-61)', () => {
  it('answers liveness without touching dependencies, in contract shape', async () => {
    const harness = buildHarness();
    const response = await harness.app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    const body: unknown = response.json();
    expect(healthResponseSchema.safeParse(body).success).toBe(true);
    const health = healthResponseSchema.parse(body);
    expect(health.serverTime.endsWith('Z')).toBe(true); // API-36 on the wire
    expect(health.commit).toBe('test'); // OPS-61 build metadata
  });

  it('reports readiness as booleans only (OPS-60)', async () => {
    const ready = buildHarness({ readiness: () => Promise.resolve(true) });
    const readyResponse = await ready.app.inject({ method: 'GET', url: '/readyz' });
    expect(readyResponse.statusCode).toBe(200);
    expect(readyResponseSchema.parse(readyResponse.json())).toEqual({
      status: 'ready',
      service: 'api',
      checks: { database: true },
    });

    const down = buildHarness({ readiness: () => Promise.resolve(false) });
    const downResponse = await down.app.inject({ method: 'GET', url: '/readyz' });
    expect(downResponse.statusCode).toBe(503);
    expect(downResponse.json()).toMatchObject({ status: 'unavailable', checks: { database: false } });
    // The reason stays server-side.
    expect(downResponse.body).not.toContain('SELECT');
  });

  it('bounds the readiness probe with a short timeout (OPS-59)', async () => {
    const slow = buildHarness({
      readiness: () => new Promise<boolean>((resolveSlow) => setTimeout(() => resolveSlow(true), 5_000)),
      readinessTimeoutMs: 100,
    });
    const started = Date.now();
    const response = await slow.app.inject({ method: 'GET', url: '/readyz' });
    expect(response.statusCode).toBe(503);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('treats a throwing readiness probe as unavailable', async () => {
    const throwing = buildHarness({
      readiness: () => Promise.reject(new Error('pool exhausted')),
    });
    const response = await throwing.app.inject({ method: 'GET', url: '/readyz' });
    expect(response.statusCode).toBe(503);
  });
});

describe('error envelope (API-11, API-37, SEC-49)', () => {
  it('answers unknown paths — including /api/v1 — with the envelope 404', async () => {
    const harness = buildHarness();
    for (const url of ['/definitely-not-here', '/api/v1/whatever']) {
      const response = await harness.app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(404);
      const envelope = errorEnvelopeSchema.parse(response.json()) satisfies ErrorEnvelope;
      expect(envelope.code).toBe(ERROR_CODES.notFound);
      expect(envelope.requestId.length).toBeGreaterThanOrEqual(8);
    }
  });

  it('never leaks internals on a 5xx, and logs them server-side instead', async () => {
    const harness = buildHarness();
    harness.app.get('/boom', () => {
      throw new Error('connection string postgres://user:secret@db exploded');
    });
    const response = await harness.app.inject({ method: 'GET', url: '/boom' });
    expect(response.statusCode).toBe(500);
    const envelope = errorEnvelopeSchema.parse(response.json());
    expect(envelope.code).toBe(ERROR_CODES.internal);
    expect(envelope.message).toBe(INTERNAL_ERROR_MESSAGE);
    expect(response.body).not.toContain('exploded');
    expect(response.body).not.toContain('secret');
    const errorLine = harness.lines().find((line) => line['msg'] === 'request failed');
    expect(errorLine).toBeDefined();
    expect(JSON.stringify(errorLine)).toContain('exploded'); // server-side log keeps the detail
  });

  it('maps validation failures to 400 with field details', async () => {
    const harness = buildHarness();
    harness.app.post<{ Body: { name: string } }>(
      '/validated',
      {
        schema: {
          body: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
        },
      },
      (request) => ({ ok: request.body.name }),
    );
    const response = await harness.app.inject({ method: 'POST', url: '/validated', payload: {} });
    expect(response.statusCode).toBe(400);
    const envelope = errorEnvelopeSchema.parse(response.json());
    expect(envelope.code).toBe(ERROR_CODES.validationFailed);
    expect(envelope.details?.length).toBeGreaterThan(0);
  });
});

describe('correlation identifiers (SEC-73)', () => {
  it('echoes a valid incoming identifier on the response, in the envelope, and in logs', async () => {
    const harness = buildHarness();
    const correlationId = 'trace-7c9e6679-7425-40de-944b';
    const response = await harness.app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-correlation-id': correlationId },
    });
    expect(response.headers['x-correlation-id']).toBe(correlationId);
    expect(response.headers['x-request-id']).toBe(correlationId);
    const completion = harness.lines().find((line) => line['msg'] === 'request completed');
    expect(completion?.['correlationId']).toBe(correlationId);
  });

  it('replaces an invalid incoming identifier instead of trusting it', async () => {
    const harness = buildHarness();
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/x',
      headers: { 'x-correlation-id': 'bad id\ninjected' },
    });
    const echoed = String(response.headers['x-correlation-id'] ?? '');
    expect(echoed).not.toBe('bad id\ninjected');
    expect(echoed).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]{7,63}$/);
    const envelope = errorEnvelopeSchema.parse(response.json());
    expect(envelope.requestId).toBe(echoed);
  });

  it('generates one identifier per request when none arrives', async () => {
    const harness = buildHarness();
    const first = await harness.app.inject({ method: 'GET', url: '/healthz' });
    const second = await harness.app.inject({ method: 'GET', url: '/healthz' });
    const firstId = String(first.headers['x-correlation-id'] ?? '');
    const secondId = String(second.headers['x-correlation-id'] ?? '');
    expect(firstId).toMatch(/^[0-9a-f-]{36}$/);
    expect(firstId).not.toBe(secondId);
  });
});

describe('status-to-code mapping (API-11 stable codes)', () => {
  it('maps client and server statuses to their stable envelope codes', async () => {
    const harness = buildHarness();
    const cases: Array<[number, string]> = [
      [400, 'validation_failed'],
      [401, 'unauthorized'],
      [403, 'forbidden'],
      [408, 'request_timeout'],
      [409, 'conflict'],
      [413, 'payload_too_large'],
      [415, 'unsupported_media_type'],
      [429, 'too_many_requests'],
      [418, 'bad_request'], // unmapped 4xx falls back to the generic client-error code
      [503, 'service_unavailable'],
      [500, 'internal_error'],
      [501, 'internal_error'], // unmapped 5xx falls back to the generic server-error code
    ];
    // Register every route before the first inject: Fastify rejects new routes once started.
    for (const [status] of cases) {
      harness.app.get(`/status-${status}`, (_request, reply) => {
        const error = new Error(`simulated ${status}`) as Error & { statusCode?: number };
        error.statusCode = status;
        void reply.send(error);
      });
    }
    for (const [status, code] of cases) {
      const response = await harness.app.inject({ method: 'GET', url: `/status-${status}` });
      expect(response.statusCode, `status ${status}`).toBe(status);
      const envelope = errorEnvelopeSchema.parse(response.json());
      expect(envelope.code, `status ${status}`).toBe(code);
      if (status >= 500) {
        // Server failures never echo the thrown message (SEC-49).
        expect(response.body).not.toContain(`simulated ${status}`);
      }
    }
  });
});

describe('security headers and CORS (SEC-44, SEC-45 baseline)', () => {
  it('sends the baseline header set on API responses', async () => {
    const harness = buildHarness();
    const response = await harness.app.inject({ method: 'GET', url: '/healthz' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(String(response.headers['content-security-policy'])).toContain("frame-ancestors 'none'");
    expect(response.headers['referrer-policy']).toBe('no-referrer');
  });

  it('allows only listed origins and rejects wildcards at registration', async () => {
    const harness = buildHarness({ origins: ['http://localhost:5173'] });
    const allowed = await harness.app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const denied = await harness.app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { origin: 'http://evil.example' },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();

    const wildcardApp = Fastify({ logger: false });
    apps.push(wildcardApp);
    expect(() => applyCors(wildcardApp, ['*'])).toThrow(/wildcard/);
  });
});

describe('metrics wiring (OPS-63)', () => {
  it('counts requests with the matched route pattern, never raw URLs', async () => {
    const harness = buildHarness();
    await harness.app.inject({ method: 'GET', url: '/healthz' });
    await harness.app.inject({ method: 'GET', url: '/api/v1/users/12345' });
    const rendered = harness.registry.render();
    expect(rendered).toContain('http_requests_total{service="api",method="GET",route="/healthz",status="200"}');
    expect(rendered).not.toContain('12345'); // bounded cardinality: unmatched paths never enter labels
  });
});
