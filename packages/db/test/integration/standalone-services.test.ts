import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import pg from 'pg';
import { describe, expect, it, inject } from 'vitest';
import { createDatabaseFor } from '@boro-biya/test-utils/pg';
import { exportService } from '../../../../scripts/services/export.mjs';

async function port() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('port allocation failed');
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return address.port;
}
async function stop(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill();
  const timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
  try {
    await exited;
  } finally {
    clearTimeout(timer);
  }
}

describe('outside-checkout independent service deployment (PLG-03, PLG-13, PLG-18)', () => {
  it.each(['core', 'relation', 'sos'] as const)(
    'builds, migrates and runs %s without any other service',
    async (service) => {
      const parent = mkdtempSync(join(tmpdir(), 'standalone-service-'));
      const output = join(parent, service);
      const database = await createDatabaseFor(inject('pgAdminUrl'), `standalone_${service}`);
      const password = `disposable-${service}-standalone`;
      const env = { ...process.env, DB_ADMIN_URL: database.adminConnectionString, SERVICE_DB_PASSWORD: password };
      const run = (file: string, args: string[], environment = env) =>
        execFileSync(file, args, {
          cwd: output,
          env: environment,
          stdio: 'pipe',
          timeout: 60_000,
          windowsHide: true,
        }).toString();
      let child: ChildProcess | undefined;
      const admin = new pg.Client({ connectionString: database.adminConnectionString });
      try {
        exportService(service, output);
        expect(readdirSync(join(output, 'services'))).toEqual([service]);
        run('bun', ['install', '--frozen-lockfile', '--ignore-scripts', '--offline']);
        run('bun', ['run', 'build']);
        for (let attempt = 0; attempt < 2; attempt++)
          run(process.execPath, ['scripts/services/migrate.mjs', service, 'up']);
        const status = JSON.parse(run(process.execPath, ['scripts/services/migrate.mjs', service, 'status'])) as Array<{
          applied: boolean;
          checksumMatches: boolean;
        }>;
        expect(status.length).toBeGreaterThan(0);
        expect(
          status.every(
            (entry: { applied: boolean; checksumMatches: boolean }) => entry.applied && entry.checksumMatches,
          ),
        ).toBe(true);
        run(process.execPath, ['scripts/services/migrate.mjs', service, 'down']);
        run(process.execPath, ['scripts/services/migrate.mjs', service, 'up']);
        await admin.connect();
        const schemas = await admin.query(
          "SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('core','relation','sos')",
        );
        expect(schemas.rows.map((row: { schema_name: string }) => row.schema_name)).toEqual([service]);
        // Reproduce the production-only install and prove tooling/other units are absent.
        rmSync(join(output, 'node_modules'), { recursive: true, force: true });
        for (const group of ['packages', 'services'])
          for (const entry of readdirSync(join(output, group)))
            rmSync(join(output, group, entry, 'node_modules'), { recursive: true, force: true });
        run('bun', ['install', '--production', '--frozen-lockfile', '--ignore-scripts', '--offline']);
        expect(existsSync(join(output, 'node_modules/typescript'))).toBe(false);
        const apiPort = await port(),
          metricsPort = await port();
        const url = new URL(database.adminConnectionString);
        url.username = `boro_${service}`;
        url.password = password;
        const runtimeEnv: NodeJS.ProcessEnv = {
          ...process.env,
          NODE_ENV: 'test',
          API_HOST: '127.0.0.1',
          API_PORT: String(apiPort),
          METRICS_HOST: '127.0.0.1',
          METRICS_PORT: String(metricsPort),
          DATABASE_URL: url.toString(),
          WEB_ORIGIN: 'http://localhost:5173',
          SESSION_SECRET: 'standalone-disposable-only-identity-material',
          BUILD_COMMIT: 'standalone-rehearsal',
        };
        delete runtimeEnv['DB_ADMIN_URL'];
        delete runtimeEnv['SERVICE_DB_PASSWORD'];
        child = spawn(process.execPath, [`services/${service}/dist/main.js`], {
          cwd: output,
          env: runtimeEnv,
          stdio: 'ignore',
          windowsHide: true,
        });
        const origin = `http://127.0.0.1:${apiPort}`;
        let ready = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          if (child.exitCode !== null) throw new Error('standalone process exited before readiness');
          try {
            if ((await fetch(`${origin}/readyz`, { signal: AbortSignal.timeout(1_000) })).status === 200) {
              ready = true;
              break;
            }
          } catch {
            /* listener may not have bound yet */
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect(ready).toBe(true);
        const health = (await (await fetch(`${origin}/healthz`)).json()) as { service: string; commit: string };
        expect(health.service).toBe(service === 'core' ? 'api' : service);
        expect(health.commit).toBe('standalone-rehearsal');
        for (const path of ['/api/v1/admin/plugins/packages', '/api/v1/admin/services/packages']) {
          expect(
            (
              await fetch(`${origin}${path}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: '{}',
              })
            ).status,
          ).toBe(404);
        }
      } finally {
        await stop(child);
        await admin.end();
        await database.drop();
        rmSync(parent, { recursive: true, force: true });
      }
    },
  );
});
