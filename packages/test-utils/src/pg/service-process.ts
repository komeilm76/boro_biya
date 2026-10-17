import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

interface Ports {
  apiPort: number;
  metricsPort: number;
}

/** Hold both OS-assigned ports together, then release immediately before spawning.
 * Another process can still win that release/bind race; only EADDRINUSE permits a retry.
 */
export async function allocateServiceTestPorts(): Promise<Ports> {
  const probes: Server[] = [];
  try {
    for (let index = 0; index < 2; index++) {
      const probe = createServer();
      probes.push(probe);
      await new Promise<void>((resolve, reject) => {
        probe.once('error', reject);
        probe.listen({ host: '127.0.0.1', port: 0, exclusive: true }, resolve);
      });
    }
    const ports = probes.map((probe) => {
      const address = probe.address();
      if (address === null || typeof address === 'string') throw new Error('test port allocation failed');
      return address.port;
    });
    return { apiPort: ports[0]!, metricsPort: ports[1]! };
  } finally {
    await Promise.all(
      probes
        .filter((probe) => probe.listening)
        .map(
          (probe) =>
            new Promise<void>((resolve, reject) => {
              probe.close((error) => (error ? reject(error) : resolve()));
            }),
        ),
    );
  }
}

export interface RunningTestService {
  child: ChildProcess;
  baseUrl: string;
  metricsUrl: string;
  logs: string[];
  stop(): Promise<number | null>;
}

interface StartOptions {
  main: string;
  cwd: string;
  service: string;
  env: Record<string, string>;
  /** Shared across all allocation attempts; production test callers keep the 30-second budget. */
  startupTimeoutMs?: number;
  /** Unit-test seam for forcing a real release/bind collision. */
  allocatePorts?: () => Promise<Ports>;
}

/** Test harness only; starts the unchanged built service and proves ownership before returning.
 * Never retries readiness/assertion failures or kills a process that owns an occupied port.
 */
export async function startTestService(options: StartOptions): Promise<RunningTestService> {
  const deadline = Date.now() + (options.startupTimeoutMs ?? 30_000);
  for (let attempt = 0; attempt < 3; attempt++) {
    const ports = await (options.allocatePorts ?? allocateServiceTestPorts)();
    if (ports.apiPort === ports.metricsPort) throw new Error('test API and metrics ports must differ');
    const marker = `itest-${randomUUID()}`;
    const child = spawn(process.execPath, [options.main], {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
        NODE_ENV: 'test',
        SERVICE_NAME: options.service,
        API_HOST: '127.0.0.1',
        API_PORT: String(ports.apiPort),
        METRICS_HOST: '127.0.0.1',
        METRICS_PORT: String(ports.metricsPort),
        LOG_LEVEL: 'info',
        BUILD_COMMIT: marker,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const logs: string[] = [];
    let stdout = '',
      started = false,
      closed = false,
      spawnFailed = false;
    child.once('error', () => {
      spawnFailed = true;
    });
    const completion = new Promise<number | null>((resolve) => {
      child.once('close', (code) => {
        closed = true;
        resolve(code);
      });
    });
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => logs.push(chunk));
    child.stdout?.on('data', (chunk: string) => {
      logs.push(chunk);
      stdout += chunk;
      const lines = stdout.split('\n');
      stdout = lines.pop() ?? '';
      for (const line of lines) {
        try {
          const value = JSON.parse(line) as Record<string, unknown> | null;
          if (
            value?.['msg'] === 'service started' &&
            value['service'] === options.service &&
            value['commit'] === marker &&
            value['apiPort'] === ports.apiPort &&
            value['metricsPort'] === ports.metricsPort
          )
            started = true;
        } catch {
          /* A startup error may be plain Node output rather than JSON. */
        }
      }
    });
    const stop = async () => {
      if (closed) return completion;
      const force = setTimeout(() => child.kill('SIGKILL'), 15_000);
      try {
        child.kill('SIGTERM');
        return await completion;
      } finally {
        clearTimeout(force);
      }
    };
    const baseUrl = `http://127.0.0.1:${ports.apiPort}`;
    try {
      while (!closed && !spawnFailed && Date.now() < deadline) {
        // This child emits the marker only after BOTH listeners bind. A coincidental
        // health endpoint on an occupied port cannot make an unsuccessful spawn pass.
        if (started) {
          let response: Response | undefined;
          try {
            response = await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(1_000) });
          } catch {
            /* Still subject to the same startup deadline and child-exit checks. */
          }
          if (response?.ok) {
            let body: unknown;
            try {
              body = await response.json();
            } catch {
              throw new Error('test service health response is not JSON');
            }
            if (
              body === null ||
              typeof body !== 'object' ||
              !('status' in body) ||
              body.status !== 'ok' ||
              !('service' in body) ||
              body.service !== options.service ||
              !('commit' in body) ||
              body.commit !== marker
            )
              throw new Error('test service health identity mismatch');
            if (closed) throw new Error('test service exited during its health probe');
            return { child, baseUrl, metricsUrl: `http://127.0.0.1:${ports.metricsPort}/metrics`, logs, stop };
          }
        }
        await delay(200);
      }
      const exited = closed;
      const timedOut = Date.now() >= deadline;
      await stop();
      if (exited && logs.some((line) => line.includes('EADDRINUSE')) && !spawnFailed) {
        if (attempt < 2 && Date.now() < deadline) continue;
        throw new Error('test service bind collision persisted; allocation attempts exhausted');
      }
      throw new Error(
        spawnFailed
          ? 'test service process could not be spawned'
          : timedOut
            ? 'test service startup deadline exceeded'
            : 'test service exited before startup completed',
      );
    } catch (error) {
      await stop();
      throw error;
    }
  }
  throw new Error('test service allocation attempts exhausted');
}
