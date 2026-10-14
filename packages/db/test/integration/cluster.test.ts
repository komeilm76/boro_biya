import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';
import { createDatabaseFor, type TestDatabaseHandle } from '@boro-biya/test-utils/pg';
import {
  CLUSTER_SERVICES,
  initCluster,
  migrateDown,
  migrateUp,
  migrationStatus,
  serviceConnectionString,
} from '../../src/index.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const PASSWORDS = {
  core: 'itest-core-disposable',
  relation: 'itest-relation-disposable',
  sos: 'itest-sos-disposable',
} as const;

let database: TestDatabaseHandle;

beforeAll(async () => {
  database = await createDatabaseFor(inject('pgAdminUrl'), 'cluster');
});

afterAll(async () => {
  await database.drop();
});

async function withAdminPool(run: (pool: pg.Pool) => Promise<void>): Promise<void> {
  const pool = new pg.Pool({ connectionString: database.adminConnectionString, max: 2 });
  try {
    await run(pool);
  } finally {
    await pool.end();
  }
}

async function schemaExists(schema: string): Promise<boolean> {
  let exists = false;
  await withAdminPool(async (pool) => {
    const result = await pool.query('SELECT 1 FROM information_schema.schemata WHERE schema_name = $1', [schema]);
    exists = (result.rowCount ?? 0) > 0;
  });
  return exists;
}

describe('cluster bootstrap (OPS-16 … OPS-18, QA-15)', () => {
  it('creates roles, schemas, and applies every service migration — idempotently', async () => {
    await initCluster({ adminConnectionString: database.adminConnectionString, passwords: PASSWORDS, repoRoot: ROOT });
    await initCluster({ adminConnectionString: database.adminConnectionString, passwords: PASSWORDS, repoRoot: ROOT });

    for (const service of CLUSTER_SERVICES) {
      expect(await schemaExists(service.schema), service.schema).toBe(true);
      await withAdminPool(async (pool) => {
        const status = await migrationStatus(pool, {
          schema: service.schema,
          migrationsDir: join(ROOT, service.migrationsDir),
        });
        expect(status.length).toBeGreaterThan(0);
        for (const entry of status) {
          expect(entry.applied, `${service.key}/${entry.name}`).toBe(true);
          expect(entry.checksumMatches).toBe(true);
        }
      });
    }
  });

  it('isolates every service schema from the other services\u2019 roles (OPS-18, caught by permission tests)', async () => {
    for (const service of CLUSTER_SERVICES) {
      const url = serviceConnectionString(database.adminConnectionString, service, PASSWORDS[service.key]);
      const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5_000 });
      await client.connect();
      try {
        // Its own schema is usable...
        const own = await client.query('SELECT has_schema_privilege(current_user, $1, $2)', [service.schema, 'USAGE']);
        expect((own.rows as Array<Record<string, unknown>>)[0]?.['has_schema_privilege']).toBe(true);
        // ...and every other service schema is denied before any table is even resolved.
        for (const other of CLUSTER_SERVICES) {
          if (other.key === service.key) continue;
          await expect(client.query(`SELECT 1 FROM ${other.schema}.schema_migrations`)).rejects.toThrow(
            /permission denied/,
          );
          const denied = await client.query('SELECT has_schema_privilege(current_user, $1, $2)', [
            other.schema,
            'USAGE',
          ]);
          expect((denied.rows as Array<Record<string, unknown>>)[0]?.['has_schema_privilege']).toBe(false);
        }
      } finally {
        await client.end();
      }
    }
  });

  it('reverses and re-applies migrations (QA-15; the OPS-81 runbook mechanics)', async () => {
    await withAdminPool(async (pool) => {
      const reversed = await migrateDown(pool, {
        schema: 'sos',
        migrationsDir: join(ROOT, 'services/sos/migrations'),
        steps: 1,
      });
      expect(reversed).toEqual([1]);
    });
    expect(await schemaExists('sos')).toBe(false); // down dropped the schema, ledger included

    await withAdminPool(async (pool) => {
      const applied = await migrateUp(pool, { schema: 'sos', migrationsDir: join(ROOT, 'services/sos/migrations') });
      expect(applied.applied).toEqual([1]);
    });
    expect(await schemaExists('sos')).toBe(true);
  });

  it('fails closed when an applied migration file changes (QA-49 tamper detection)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'boro-tamper-'));
    try {
      writeFileSync(join(dir, '0001_probe.up.sql'), 'CREATE TABLE IF NOT EXISTS probe (id integer);\n', 'utf8');
      writeFileSync(join(dir, '0001_probe.down.sql'), 'DROP TABLE IF EXISTS probe;\n', 'utf8');
      await withAdminPool(async (pool) => {
        const first = await migrateUp(pool, { schema: 'tamper_probe', migrationsDir: dir });
        expect(first.applied).toEqual([1]);
        writeFileSync(
          join(dir, '0001_probe.up.sql'),
          'CREATE TABLE IF NOT EXISTS probe (id integer); -- edited\n',
          'utf8',
        );
        await expect(migrateUp(pool, { schema: 'tamper_probe', migrationsDir: dir })).rejects.toThrow(
          /changed after it was applied/,
        );
        await expect(migrateDown(pool, { schema: 'tamper_probe', migrationsDir: dir, steps: 1 })).rejects.toThrow(
          /checksum mismatch/,
        );
        await pool.query('DROP SCHEMA IF EXISTS tamper_probe CASCADE');
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects unsafe schema identifiers before any SQL is built (SEC-42)', async () => {
    await withAdminPool(async (pool) => {
      await expect(
        migrateUp(pool, { schema: 'core; DROP TABLE users', migrationsDir: join(ROOT, 'apps/api/migrations') }),
      ).rejects.toThrow(/unsafe schema identifier/);
    });
  });
});
