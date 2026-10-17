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
const MAIN = join(ROOT, 'services/relation/dist/main.js');
const PASSWORDS = {
  core: 'itest-core-disposable',
  relation: 'itest-relation-disposable',
  sos: 'itest-sos-disposable',
} as const;

let database: TestDatabaseHandle;
let running: RunningTestService | undefined;

beforeAll(async () => {
  if (!existsSync(MAIN)) throw new Error('services/relation/dist/main.js is missing — run `bun run build` first');
  database = await createDatabaseFor(inject('pgAdminUrl'), 'relation_runtime');
  await initCluster({ adminConnectionString: database.adminConnectionString, passwords: PASSWORDS, repoRoot: ROOT });
});

afterAll(async () => {
  await running?.stop();
  await database?.drop();
});

describe('Relation Service artefact with its own least-privilege role (OPS-03, OPS-17)', () => {
  it('connects as boro_relation and reports readiness green', async () => {
    const relation = CLUSTER_SERVICES.find((service) => service.key === 'relation');
    if (relation === undefined) throw new Error('cluster map lost the relation service');
    const relationUrl = serviceConnectionString(database.adminConnectionString, relation, PASSWORDS.relation);

    running = await startTestService({
      main: MAIN,
      cwd: ROOT,
      service: 'relation',
      env: { DATABASE_URL: relationUrl, GRACEFUL_SHUTDOWN_TIMEOUT_SECONDS: '5' },
    });
    try {
      const ready = await fetch(`${running.baseUrl}/readyz`, { signal: AbortSignal.timeout(5_000) });
      expect(ready.status).toBe(200);
      expect(await ready.json()).toMatchObject({ status: 'ready', service: 'relation', checks: { database: true } });
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
