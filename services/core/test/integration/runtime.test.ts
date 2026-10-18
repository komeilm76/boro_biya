import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';
import { CLUSTER_SERVICES, initCluster, serviceConnectionString } from '@boro-biya/db';
import {
  applyErrorEnvelope,
  applyHealthRoutes,
  applyObservability,
  correlationHeaders,
  createLogger,
  createMetricsRegistry,
} from '@boro-biya/server-runtime';
import { makeCapturedLog } from '@boro-biya/test-utils';
import { createDatabaseFor, startTestService, type TestDatabaseHandle } from '@boro-biya/test-utils/pg';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const MAIN = join(ROOT, 'services/core/dist/main.js');
const PASSWORDS = {
  core: 'itest-core-disposable',
  relation: 'itest-relation-disposable',
  sos: 'itest-sos-disposable',
} as const;

let database: TestDatabaseHandle;
let coreUrl: string;

beforeAll(async () => {
  if (!existsSync(MAIN)) {
    throw new Error(
      'services/core/dist/main.js is missing — the integration run consumes built artefacts; run `bun run build` first',
    );
  }
  database = await createDatabaseFor(inject('pgAdminUrl'), 'api_runtime');
  await initCluster({ adminConnectionString: database.adminConnectionString, passwords: PASSWORDS, repoRoot: ROOT });
  const core = CLUSTER_SERVICES.find((service) => service.key === 'core');
  if (core === undefined) throw new Error('cluster map lost the core service');
  coreUrl = serviceConnectionString(database.adminConnectionString, core, PASSWORDS.core);
});

afterAll(async () => {
  await database.drop();
});

describe('the built artefact against real PostgreSQL 18 (QA-06, QA-11, QA-123 mechanics)', () => {
  it('reports readiness green with the database reachable, then shuts down gracefully (OPS-62)', async () => {
    const service = await startTestService({
      main: MAIN,
      cwd: ROOT,
      service: 'api',
      env: {
        DATABASE_URL: coreUrl,
        WEB_ORIGIN: 'http://localhost:5173',
        SESSION_SECRET: 'disposable-runtime-test-only-signing-material',
        GRACEFUL_SHUTDOWN_TIMEOUT_SECONDS: '5',
      },
    });
    try {
      const ready = await fetch(`${service.baseUrl}/readyz`, { signal: AbortSignal.timeout(5_000) });
      expect(ready.status).toBe(200);
      expect(await ready.json()).toMatchObject({ status: 'ready', checks: { database: true } });

      const metrics = await fetch(service.metricsUrl, { signal: AbortSignal.timeout(5_000) });
      expect(metrics.status).toBe(200);
      expect(await metrics.text()).toContain('process_resident_memory_bytes');

      const exitCode = await service.stop();
      if (process.platform === 'win32') {
        // Windows emulates SIGTERM as unconditional termination: a graceful exit code is not
        // observable there. The drain sequence itself is asserted cross-platform by the
        // shutdown-controller unit tests; the POSIX behaviour is asserted on Linux/macOS here
        // and by the runtime compatibility check (QA-123) in CI.
        expect(service.logs.join('').length).toBeGreaterThan(0);
      } else {
        expect(exitCode).toBe(0); // SIGTERM drained and exited 0
        expect(service.logs.join('')).toContain('shutdown complete');
      }
    } finally {
      await service.stop();
    }
  }, 90_000);

  it('fails startup on invalid configuration with a non-secret diagnostic (OPS-53)', async () => {
    const missingDb = spawn(process.execPath, [MAIN], {
      cwd: ROOT,
      env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: '', WEB_ORIGIN: 'http://localhost:5173' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output: string[] = [];
    missingDb.stdout?.setEncoding('utf8');
    missingDb.stderr?.setEncoding('utf8');
    missingDb.stdout?.on('data', (chunk: string) => output.push(chunk));
    missingDb.stderr?.on('data', (chunk: string) => output.push(chunk));
    const code = await new Promise<number | null>((resolveExit) => missingDb.on('exit', resolveExit));
    expect(code).not.toBe(0);
    expect(output.join('')).toContain('DATABASE_URL');

    const placeholder = spawn(process.execPath, [MAIN], {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: '<development|test|production>',
        DATABASE_URL: 'postgres://x:y@127.0.0.1:1/z',
        WEB_ORIGIN: 'http://localhost:5173',
        SESSION_SECRET: 'disposable-runtime-test-only-signing-material',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const placeholderOutput: string[] = [];
    placeholder.stderr?.setEncoding('utf8');
    placeholder.stdout?.setEncoding('utf8');
    placeholder.stdout?.on('data', (chunk: string) => placeholderOutput.push(chunk));
    placeholder.stderr?.on('data', (chunk: string) => placeholderOutput.push(chunk));
    const placeholderCode = await new Promise<number | null>((resolveExit) => placeholder.on('exit', resolveExit));
    expect(placeholderCode).not.toBe(0);
    expect(placeholderOutput.join('')).toContain('placeholder');
    expect(placeholderOutput.join('')).not.toContain('postgres://x:y@127.0.0.1:1/z');
  }, 60_000);
});

describe('one correlation identifier across service hops (SEC-73)', () => {
  const apps: FastifyInstance[] = [];

  afterAll(async () => {
    while (apps.length > 0) {
      const app = apps.pop();
      await app?.close();
    }
  });

  it('travels from the entry service to the next hop and appears in both services\u2019 logs', async () => {
    // Hop B: a service built on the shared harness, with a test-only route.
    const captureB = makeCapturedLog();
    const upstream = Fastify({ logger: false });
    apps.push(upstream);
    applyObservability(upstream, {
      logger: createLogger({ service: 'relation', version: '0.1.0', level: 'info', sink: captureB.sink }),
      registry: createMetricsRegistry(),
      service: 'relation',
    });
    applyErrorEnvelope(upstream, {
      logger: createLogger({ service: 'relation', version: '0.1.0', level: 'info', sink: captureB.sink }),
    });
    applyHealthRoutes(upstream, { service: 'relation', version: '0.1.0', commit: 'test' });
    upstream.get('/internal/echo', (request) => ({ correlationId: request.correlationId }));
    const upstreamAddress = await upstream.listen({ host: '127.0.0.1', port: 0 });

    // Hop A: the entry service forwards the identifier with the shared propagation helper.
    const captureA = makeCapturedLog();
    const entryLogger = createLogger({ service: 'api', version: '0.1.0', level: 'info', sink: captureA.sink });
    const entry = Fastify({ logger: false });
    apps.push(entry);
    applyObservability(entry, { logger: entryLogger, registry: createMetricsRegistry(), service: 'api' });
    applyErrorEnvelope(entry, { logger: entryLogger });
    entry.get('/hop', async (request) => {
      const response = await fetch(`${upstreamAddress}/internal/echo`, {
        headers: correlationHeaders(request.correlationId),
      });
      return await response.json();
    });
    await entry.listen({ host: '127.0.0.1', port: 0 });

    const sent = 'integration-hop-trace-0001';
    const response = await entry.inject({ method: 'GET', url: '/hop', headers: { 'x-correlation-id': sent } });
    expect(response.statusCode).toBe(200);
    expect(await response.json()).toEqual({ correlationId: sent });

    // The same identifier appears in both services' structured logs — one action, one trace.
    expect(JSON.stringify(captureA.lines())).toContain(sent);
    expect(JSON.stringify(captureB.lines())).toContain(sent);
    const hopLine = captureB.lines().find((line) => line['msg'] === 'request completed');
    expect(hopLine?.['correlationId']).toBe(sent);
  });
});
