import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations, getMigrationStatus, rollbackMigrations } from '../src/db/migrate.js';
import type { MigrationError } from '../src/db/migrate.js';
import { createApiServer } from '../src/server.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required; integration tests must not be reported as skipped');
}

const pool = new Pool({ connectionString, max: 3, connectionTimeoutMillis: 2_000 });
const sandboxSchemas = new Set<string>();
const sandboxDirectories = new Set<string>();

interface Sandbox {
  schema: string;
  directory: string;
}

async function createSandbox(): Promise<Sandbox> {
  const schema = `phase1_${randomUUID().replaceAll('-', '')}`;
  const directory = await mkdtemp(join(tmpdir(), 'boro-phase1-migrations-'));
  sandboxSchemas.add(schema);
  sandboxDirectories.add(directory);
  await pool.query(`CREATE SCHEMA "${schema}"`);
  return { schema, directory };
}

async function writePair(directory: string, id: string, up: string, down: string): Promise<void> {
  await Promise.all([
    writeFile(join(directory, `${id}.sql`), up, 'utf8'),
    writeFile(join(directory, `${id}.down.sql`), down, 'utf8'),
  ]);
}

async function tableExists(schema: string, tableName: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2) AS exists',
    [schema, tableName],
  );
  return result.rows[0]?.exists ?? false;
}

async function ledgerCount(schema: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM "${schema}"."schema_migrations"`,
  );
  return Number(result.rows[0]?.count ?? '0');
}

beforeAll(async () => {
  await pool.query('SELECT 1');
});

afterEach(async () => {
  for (const schema of sandboxSchemas) {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
  sandboxSchemas.clear();
  for (const directory of sandboxDirectories) {
    await rm(directory, { recursive: true, force: true });
  }
  sandboxDirectories.clear();
});

afterAll(async () => {
  await pool.end();
});

describe('PostgreSQL migration transactions and health', () => {
  it('applies each migration once and records its checksum', async () => {
    const sandbox = await createSandbox();
    await writePair(
      sandbox.directory,
      '0001_create_probe',
      'CREATE TABLE migration_probe (marker text NOT NULL);',
      'DROP TABLE migration_probe;',
    );

    expect(await applyMigrations(pool, sandbox)).toEqual(['0001_create_probe']);
    expect(await applyMigrations(pool, sandbox)).toEqual([]);
    expect(await getMigrationStatus(pool, sandbox)).toMatchObject([
      { id: '0001_create_probe', applied: true },
    ]);
    expect(await ledgerCount(sandbox.schema)).toBe(1);
  });

  it('leaves no migration ledger row or partial object when an up file fails', async () => {
    const sandbox = await createSandbox();
    await writePair(
      sandbox.directory,
      '0001_failing_probe',
      'CREATE TABLE partial_probe (marker text NOT NULL); INSERT INTO absent_probe VALUES (1);',
      'DROP TABLE partial_probe;',
    );

    await expect(applyMigrations(pool, sandbox)).rejects.toMatchObject<Partial<MigrationError>>({
      code: 'MIGRATION_APPLY_FAILED',
    });
    expect(await tableExists(sandbox.schema, 'partial_probe')).toBe(false);
    expect(await ledgerCount(sandbox.schema)).toBe(0);
  });

  it('keeps a failed rollback unchanged and succeeds when the down file is corrected', async () => {
    const sandbox = await createSandbox();
    const migrationId = '0001_retryable_probe';
    await writePair(
      sandbox.directory,
      migrationId,
      'CREATE TABLE retry_probe (marker text NOT NULL);',
      'DROP TABLE missing_probe;',
    );
    await applyMigrations(pool, sandbox);

    await expect(rollbackMigrations(pool, 1, sandbox)).rejects.toMatchObject<
      Partial<MigrationError>
    >({
      code: 'MIGRATION_ROLLBACK_FAILED',
    });
    expect(await tableExists(sandbox.schema, 'retry_probe')).toBe(true);
    expect(await ledgerCount(sandbox.schema)).toBe(1);

    await writeFile(
      join(sandbox.directory, `${migrationId}.down.sql`),
      'DROP TABLE retry_probe;',
      'utf8',
    );
    expect(await rollbackMigrations(pool, 1, sandbox)).toEqual([migrationId]);
    expect(await tableExists(sandbox.schema, 'retry_probe')).toBe(false);
    expect(await ledgerCount(sandbox.schema)).toBe(0);
  });

  it('refuses an applied migration whose up-file checksum changed', async () => {
    const sandbox = await createSandbox();
    const migrationId = '0001_checksum_probe';
    const upPath = join(sandbox.directory, `${migrationId}.sql`);
    await writePair(
      sandbox.directory,
      migrationId,
      'CREATE TABLE checksum_probe (id integer);',
      'DROP TABLE checksum_probe;',
    );
    await applyMigrations(pool, sandbox);
    await writeFile(upPath, 'CREATE TABLE checksum_probe (id integer, marker text);', 'utf8');

    await expect(getMigrationStatus(pool, sandbox)).rejects.toMatchObject<Partial<MigrationError>>({
      code: 'MIGRATION_CHECKSUM_MISMATCH',
    });
    expect(await tableExists(sandbox.schema, 'checksum_probe')).toBe(true);
    expect(await ledgerCount(sandbox.schema)).toBe(1);
  });

  it('reports a missing migrations directory instead of treating it as empty', async () => {
    const sandbox = await createSandbox();
    await expect(
      getMigrationStatus(pool, {
        schema: sandbox.schema,
        directory: join(sandbox.directory, 'missing'),
      }),
    ).rejects.toMatchObject<Partial<MigrationError>>({ code: 'MIGRATION_DIRECTORY_MISSING' });
  });

  it('rejects a rollback file without its matching up migration', async () => {
    const sandbox = await createSandbox();
    await writeFile(join(sandbox.directory, '0001_orphan.down.sql'), 'SELECT 1;', 'utf8');
    await expect(getMigrationStatus(pool, sandbox)).rejects.toMatchObject<Partial<MigrationError>>({
      code: 'MIGRATION_PAIR_MISSING',
    });
  });

  it('serves readiness when the real PostgreSQL dependency answers', async () => {
    const app = createApiServer({ database: pool });
    try {
      const response = await app.inject({ method: 'GET', url: '/readyz' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ status: 'ok', service: 'api' });
    } finally {
      await app.close();
    }
  });
});
