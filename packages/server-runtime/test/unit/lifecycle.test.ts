import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/logger.js';
import { createMetricsRegistry } from '../../src/metrics.js';
import { startMetricsServer } from '../../src/metrics-server.js';
import { createShutdownController } from '../../src/shutdown.js';

function testLogger() {
  const raw: string[] = [];
  return {
    raw,
    logger: createLogger({ service: 'api', version: '0.1.0', level: 'debug', sink: (line) => raw.push(line) }),
    lines: () => raw.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

describe('metrics server (OPS-63)', () => {
  it('serves the registry on its own interface and 404s everything else', async () => {
    const registry = createMetricsRegistry();
    registry.counter('probe_total', 'Probe counter.').inc();
    const server = await startMetricsServer({ registry, host: '127.0.0.1', port: 0 });
    expect(server.port).toBeGreaterThan(0); // ephemeral port honoured
    try {
      const metrics = await fetch(`http://127.0.0.1:${server.port}/metrics`, { signal: AbortSignal.timeout(5_000) });
      expect(metrics.status).toBe(200);
      expect(metrics.headers.get('content-type')).toContain('text/plain');
      expect(await metrics.text()).toContain('probe_total 1');
      const other = await fetch(`http://127.0.0.1:${server.port}/anything-else`, {
        signal: AbortSignal.timeout(5_000),
      });
      expect(other.status).toBe(404);
    } finally {
      await server.close();
    }
  });
});

describe('graceful shutdown (OPS-62)', () => {
  it('closes every target, logs the sequence, and reports exit code 0', async () => {
    const capture = testLogger();
    const closed: string[] = [];
    const controller = createShutdownController({
      logger: capture.logger,
      timeoutSeconds: 5,
      targets: [
        {
          name: 'http',
          close: () => {
            closed.push('http');
            return Promise.resolve();
          },
        },
        {
          name: 'metrics',
          close: () => {
            closed.push('metrics');
            return Promise.resolve();
          },
        },
        {
          name: 'database',
          close: () => {
            closed.push('database');
            return Promise.resolve();
          },
        },
      ],
    });
    const code = await controller.shutdown('SIGTERM');
    expect(code).toBe(0);
    expect(closed.sort()).toEqual(['database', 'http', 'metrics']);
    expect(capture.lines()[0]?.['msg']).toBe('shutdown started');
    expect(capture.lines().at(-1)?.['msg']).toBe('shutdown complete');
  });

  it('forces a non-zero exit when a target exceeds the window', async () => {
    const capture = testLogger();
    const controller = createShutdownController({
      logger: capture.logger,
      timeoutSeconds: 1,
      targets: [{ name: 'stuck', close: () => new Promise((neverResolves) => setTimeout(neverResolves, 30_000)) }],
    });
    const code = await controller.shutdown('SIGTERM');
    expect(code).toBe(1);
    expect(JSON.stringify(capture.lines())).toContain('shutdown window exceeded');
  });

  it('survives a failing target and still reports the failure path', async () => {
    const capture = testLogger();
    const controller = createShutdownController({
      logger: capture.logger,
      timeoutSeconds: 5,
      targets: [
        {
          name: 'broken',
          close: () => Promise.reject(new Error('close failed')),
        },
        { name: 'fine', close: () => Promise.resolve() },
      ],
    });
    const code = await controller.shutdown('SIGINT');
    expect(code).toBe(0); // a logged close failure does not hang the drain
    expect(JSON.stringify(capture.lines())).toContain('shutdown target failed to close');
  });

  it('runs the sequence once even under concurrent signals', async () => {
    const capture = testLogger();
    let closeCalls = 0;
    const controller = createShutdownController({
      logger: capture.logger,
      timeoutSeconds: 5,
      targets: [
        {
          name: 'once',
          close: () => {
            closeCalls += 1;
            return Promise.resolve();
          },
        },
      ],
    });
    const [first, second] = await Promise.all([controller.shutdown('SIGTERM'), controller.shutdown('SIGINT')]);
    expect(first).toBe(0);
    expect(second).toBe(0);
    expect(closeCalls).toBe(1);
  });
});
