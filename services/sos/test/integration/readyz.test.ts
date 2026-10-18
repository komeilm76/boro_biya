import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';
import { CLUSTER_SERVICES, initCluster, serviceConnectionString } from '@boro-biya/db';
import {
  createDatabaseFor,
  startTestService,
  type RunningTestService,
  type TestDatabaseHandle,
} from '@boro-biya/test-utils/pg';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const MAIN = join(ROOT, 'services/sos/dist/main.js');
const PASSWORDS = {
  core: 'itest-core-disposable',
  relation: 'itest-relation-disposable',
  sos: 'itest-sos-disposable',
} as const;

let database: TestDatabaseHandle;
let running: RunningTestService | undefined;

beforeAll(async () => {
  if (!existsSync(MAIN)) throw new Error('services/sos/dist/main.js is missing — run `bun run build` first');
  database = await createDatabaseFor(inject('pgAdminUrl'), 'sos_runtime');
  await initCluster({ adminConnectionString: database.adminConnectionString, passwords: PASSWORDS, repoRoot: ROOT });
});

afterAll(async () => {
  await running?.stop();
  await database?.drop();
});

describe('SOS Service artefact with its own least-privilege role (OPS-04, OPS-17)', () => {
  it('connects as boro_sos and reports readiness green', async () => {
    const sos = CLUSTER_SERVICES.find((service) => service.key === 'sos');
    if (sos === undefined) throw new Error('cluster map lost the sos service');
    const sosUrl = serviceConnectionString(database.adminConnectionString, sos, PASSWORDS.sos);

    running = await startTestService({
      main: MAIN,
      cwd: ROOT,
      service: 'sos',
      env: { DATABASE_URL: sosUrl, GRACEFUL_SHUTDOWN_TIMEOUT_SECONDS: '5' },
    });
    try {
      const ready = await fetch(`${running.baseUrl}/readyz`, { signal: AbortSignal.timeout(5_000) });
      expect(ready.status).toBe(200);
      expect(await ready.json()).toMatchObject({ status: 'ready', service: 'sos', checks: { database: true } });
      const metrics = await fetch(running.metricsUrl, { signal: AbortSignal.timeout(5_000) });
      expect(metrics.status).toBe(200);
      expect(await metrics.text()).toContain('process_resident_memory_bytes');
      const exitCode = await running.stop();
      if (process.platform !== 'win32') {
        // Windows force-terminates SIGTERM; shared controller tests cover its drain sequence.
        expect(exitCode).toBe(0);
      }
    } finally {
      await running.stop();
    }
  }, 90_000);
});
