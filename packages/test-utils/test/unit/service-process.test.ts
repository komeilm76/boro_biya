import { createServer, type Server } from 'node:net';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { allocateServiceTestPorts, startTestService } from '../../src/pg/service-process.js';

const main = fileURLToPath(new URL('../fixtures/service-process.mjs', import.meta.url));
const cwd = fileURLToPath(new URL('../../../../', import.meta.url));
async function listen(port = 0) {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ port, host: '127.0.0.1' }, resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('fixture failed to bind');
  return { server, port: address.port };
}
async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

describe('built service process fixtures', () => {
  it('allocates distinct loopback ports and releases both probe listeners', async () => {
    const ports = await allocateServiceTestPorts();
    expect(ports.apiPort).not.toBe(ports.metricsPort);
    const first = await listen(ports.apiPort);
    try {
      const second = await listen(ports.metricsPort);
      await close(second.server);
    } finally {
      await close(first.server);
    }
  });

  it.each(['apiPort', 'metricsPort'] as const)(
    'recovers only a real %s bind collision without killing its owner',
    async (key) => {
      const occupied = await listen();
      let attempts = 0;
      try {
        const service = await startTestService({
          main,
          cwd,
          service: 'fixture',
          env: {},
          allocatePorts: async () => {
            const ports = await allocateServiceTestPorts();
            return ++attempts === 1 ? { ...ports, [key]: occupied.port } : ports;
          },
        });
        try {
          expect(attempts).toBe(2);
          expect(occupied.server.listening).toBe(true);
          expect((await fetch(service.baseUrl + '/healthz')).status).toBe(200);
          expect((await fetch(service.metricsUrl)).status).toBe(200);
        } finally {
          await service.stop();
        }
        expect(await service.stop()).not.toBeUndefined();
        expect(() => process.kill(service.child.pid!, 0)).toThrow();
      } finally {
        await close(occupied.server);
      }
    },
    15_000,
  );

  it('fails after three collisions and leaves the unrelated listener alone', async () => {
    const occupied = await listen();
    let attempts = 0;
    try {
      await expect(
        startTestService({
          main,
          cwd,
          service: 'fixture',
          env: {},
          allocatePorts: async () => {
            attempts++;
            return { ...(await allocateServiceTestPorts()), apiPort: occupied.port };
          },
        }),
      ).rejects.toThrow('bind collision persisted');
      expect(attempts).toBe(3);
      expect(occupied.server.listening).toBe(true);
    } finally {
      await close(occupied.server);
    }
  }, 15_000);

  it.each([
    ['exit', 'exited before startup completed'],
    ['identity', 'health identity mismatch'],
    ['malformed', 'health response is not JSON'],
    ['silent', 'startup deadline exceeded'],
  ])(
    'does not retry %s failure and releases every child listener',
    async (mode, message) => {
      let attempts = 0;
      const ports = await allocateServiceTestPorts();
      try {
        await expect(
          startTestService({
            main,
            cwd,
            service: 'fixture',
            env: { FIXTURE_MODE: mode },
            startupTimeoutMs: mode === 'silent' ? 1000 : 10_000,
            allocatePorts: () => {
              attempts++;
              return Promise.resolve(ports);
            },
          }),
        ).rejects.toThrow(message);
        expect(attempts).toBe(1);
        const api = await listen(ports.apiPort);
        try {
          const metrics = await listen(ports.metricsPort);
          await close(metrics.server);
        } finally {
          await close(api.server);
        }
      } catch (error) {
        expect(String(error)).not.toContain('invented-sensitive-marker');
        throw error;
      }
    },
    15_000,
  );
  it('fails a spawn error once without exposing its path or starting a listener', async () => {
    const ports = await allocateServiceTestPorts();
    let attempts = 0;
    await expect(
      startTestService({
        main,
        cwd: cwd + '/invented-sensitive-marker-missing-directory',
        service: 'fixture',
        env: {},
        allocatePorts: () => {
          attempts++;
          return Promise.resolve(ports);
        },
      }),
    ).rejects.toThrow('could not be spawned');
    expect(attempts).toBe(1);
    const api = await listen(ports.apiPort);
    try {
      const metrics = await listen(ports.metricsPort);
      await close(metrics.server);
    } finally {
      await close(api.server);
    }
  });
});
