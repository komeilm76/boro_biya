import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';
import { CLUSTER_SERVICES, initCluster, serviceConnectionString } from '@boro-biya/db';
import { createDatabaseFor, type TestDatabaseHandle } from '@boro-biya/test-utils/pg';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const MAIN = join(ROOT, 'services/sos/dist/main.js');
const PASSWORDS = {
  core: 'itest-core-disposable',
  relation: 'itest-relation-disposable',
  sos: 'itest-sos-disposable',
} as const;

let database: TestDatabaseHandle;
let child: ChildProcess | null = null;

beforeAll(async () => {
  if (!existsSync(MAIN)) throw new Error('services/sos/dist/main.js is missing — run `bun run build` first');
  database = await createDatabaseFor(inject('pgAdminUrl'), 'sos_runtime');
  await initCluster({ adminConnectionString: database.adminConnectionString, passwords: PASSWORDS, repoRoot: ROOT });
});

afterAll(async () => {
  if (child !== null && child.exitCode === null) child.kill('SIGKILL');
  await database.drop();
});

describe('SOS Service artefact with its own least-privilege role (OPS-04, OPS-17)', () => {
  it('connects as boro_sos and reports readiness green', async () => {
    const sos = CLUSTER_SERVICES.find((service) => service.key === 'sos');
    if (sos === undefined) throw new Error('cluster map lost the sos service');
    const sosUrl = serviceConnectionString(database.adminConnectionString, sos, PASSWORDS.sos);

    const logs: string[] = [];
    const proc = spawn(process.execPath, [MAIN], {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        SERVICE_NAME: 'sos',
        API_HOST: '127.0.0.1',
        API_PORT: '39613',
        METRICS_HOST: '127.0.0.1',
        METRICS_PORT: '39963',
        LOG_LEVEL: 'warn',
        DATABASE_URL: sosUrl,
        GRACEFUL_SHUTDOWN_TIMEOUT_SECONDS: '5',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child = proc;
    proc.stdout?.setEncoding('utf8');
    proc.stderr?.setEncoding('utf8');
    proc.stdout?.on('data', (chunk: string) => logs.push(chunk));
    proc.stderr?.on('data', (chunk: string) => logs.push(chunk));

    const deadline = Date.now() + 30_000;
    let readyBody: Record<string, unknown> | null;
    for (;;) {
      try {
        const health = await fetch('http://127.0.0.1:39613/healthz', { signal: AbortSignal.timeout(1_000) });
        if (health.ok) {
          const ready = await fetch('http://127.0.0.1:39613/readyz', { signal: AbortSignal.timeout(5_000) });
          if (ready.status === 200) {
            readyBody = (await ready.json()) as Record<string, unknown>;
            break;
          }
        }
      } catch {
        // not up yet
      }
      if (Date.now() > deadline) throw new Error(`sos service never became ready:\n${logs.join('')}`);
      await new Promise((wait) => setTimeout(wait, 200));
    }
    expect(readyBody).not.toBeNull();
    expect(readyBody).toMatchObject({ status: 'ready', service: 'sos', checks: { database: true } });

    proc.kill('SIGTERM');
    const exitCode = await new Promise<number | null>((resolveExit) => proc.on('exit', resolveExit));
    if (process.platform !== 'win32') {
      // POSIX: SIGTERM must drain and exit 0 (OPS-62). Windows emulates SIGTERM as
      // unconditional termination, so no exit-code claim is honest there; the drain sequence
      // is asserted cross-platform by the shutdown-controller unit tests instead.
      expect(exitCode).toBe(0);
    }
  }, 90_000);
});
