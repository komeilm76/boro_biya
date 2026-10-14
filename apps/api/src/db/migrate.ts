import { createHash } from 'node:crypto';
import { access, lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool, PoolClient, QueryResultRow } from 'pg';

/** A discovered migration and the bytes used for its integrity check. */
export interface MigrationFile {
  id: string;
  upPath: string;
  downPath: string;
  upSql: string;
  downSql: string;
  checksum: string;
}

/** Status for one migration in the configured directory. */
export interface MigrationStatus {
  id: string;
  checksum: string;
  applied: boolean;
  appliedAt: string | null;
}

/** Options for applying or rolling back the API's versioned SQL files. */
export interface MigrationOptions {
  directory?: string;
  schema?: string;
}

interface LedgerRow extends QueryResultRow {
  migration_id: string;
  checksum: string;
  applied_at: Date;
}

/** Error code is stable for callers; the message does not include connection configuration. */
export class MigrationError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MigrationError';
    this.code = code;
  }
}

const MIGRATION_NAME = /^(\d{4}_[a-z0-9_]+)\.sql$/;
const DEFAULT_DIRECTORY = fileURLToPath(new URL('../../migrations/', import.meta.url));

function quoteSchema(schema: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) {
    throw new MigrationError('INVALID_SCHEMA', 'Migration schema name is invalid');
  }
  return `"${schema}"`;
}

function ledgerName(schema: string): string {
  return `${quoteSchema(schema)}."schema_migrations"`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function resolveOptions(options: MigrationOptions): { directory: string; schema: string } {
  return {
    directory: options.directory ?? DEFAULT_DIRECTORY,
    schema: options.schema ?? 'public',
  };
}

/**
 * Reads a complete, sorted migration set and rejects missing pairs or unsafe filesystem entries.
 *
 * @param directory - Directory containing `<id>.sql` and `<id>.down.sql` files.
 * @returns Migrations ordered by their permanent identifier.
 * @throws {@link MigrationError} when the directory is missing or malformed.
 */
export async function listMigrations(directory: string): Promise<MigrationFile[]> {
  try {
    await access(directory);
  } catch (cause) {
    throw new MigrationError(
      'MIGRATION_DIRECTORY_MISSING',
      `Migrations directory is missing: ${directory}`,
      {
        cause,
      },
    );
  }

  const directoryStat = await lstat(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new MigrationError(
      'MIGRATION_DIRECTORY_INVALID',
      'Migrations path must be a real directory',
    );
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const upNames = new Map<string, string>();
  const downNames = new Map<string, string>();

  for (const entry of entries) {
    if (!entry.name.endsWith('.sql')) continue;
    if (!entry.isFile()) {
      throw new MigrationError(
        'MIGRATION_FILE_INVALID',
        `Migration entry is not a regular file: ${entry.name}`,
      );
    }
    if (entry.name.endsWith('.down.sql')) {
      const id = entry.name.slice(0, -'.down.sql'.length);
      if (!/^\d{4}_[a-z0-9_]+$/.test(id)) {
        throw new MigrationError('MIGRATION_NAME_INVALID', `Invalid migration name: ${entry.name}`);
      }
      downNames.set(id, entry.name);
      continue;
    }
    const match = MIGRATION_NAME.exec(entry.name);
    if (!match) {
      throw new MigrationError('MIGRATION_NAME_INVALID', `Invalid migration name: ${entry.name}`);
    }
    upNames.set(match[1]!, entry.name);
  }

  const orphanDown = [...downNames.keys()].find((id) => !upNames.has(id));
  if (orphanDown) {
    throw new MigrationError(
      'MIGRATION_PAIR_MISSING',
      `Rollback file has no up migration: ${downNames.get(orphanDown)}`,
    );
  }

  const migrations: MigrationFile[] = [];
  for (const [id, upName] of [...upNames.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const downName = downNames.get(id);
    if (!downName) {
      throw new MigrationError(
        'MIGRATION_PAIR_MISSING',
        `Migration has no rollback file: ${upName}`,
      );
    }
    const upPath = join(directory, upName);
    const downPath = join(directory, downName);
    const [upStat, downStat] = await Promise.all([lstat(upPath), lstat(downPath)]);
    if (
      !upStat.isFile() ||
      upStat.isSymbolicLink() ||
      !downStat.isFile() ||
      downStat.isSymbolicLink()
    ) {
      throw new MigrationError(
        'MIGRATION_FILE_INVALID',
        `Migration pair must contain regular files: ${id}`,
      );
    }
    const [upSql, downSql] = await Promise.all([
      readFile(upPath, 'utf8'),
      readFile(downPath, 'utf8'),
    ]);
    if (!upSql.trim() || !downSql.trim()) {
      throw new MigrationError('MIGRATION_FILE_EMPTY', `Migration pair must not be empty: ${id}`);
    }
    migrations.push({ id, upPath, downPath, upSql, downSql, checksum: sha256(upSql) });
  }

  return migrations;
}

async function ensureLedger(pool: Pool, schema: string): Promise<void> {
  const safeSchema = quoteSchema(schema);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${safeSchema}."schema_migrations" (
    migration_id text PRIMARY KEY,
    checksum char(64) NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
}

async function readLedger(pool: Pool, schema: string): Promise<LedgerRow[]> {
  const result = await pool.query<LedgerRow>(
    `SELECT migration_id, checksum, applied_at FROM ${ledgerName(schema)} ORDER BY migration_id`,
  );
  return result.rows;
}

function assertLedgerMatchesFiles(migrations: MigrationFile[], rows: LedgerRow[]): void {
  const files = new Map(migrations.map((migration) => [migration.id, migration]));
  for (const row of rows) {
    const file = files.get(row.migration_id);
    if (!file) {
      throw new MigrationError(
        'APPLIED_MIGRATION_MISSING',
        `Applied migration file is missing: ${row.migration_id}`,
      );
    }
    if (row.checksum.trim() !== file.checksum) {
      throw new MigrationError(
        'MIGRATION_CHECKSUM_MISMATCH',
        `Applied migration was edited after it ran: ${row.migration_id}`,
      );
    }
  }
}

async function withMigrationTransaction(
  pool: Pool,
  schema: string,
  action: (client: PoolClient) => Promise<void>,
  failureCode: string,
  migrationId: string,
): Promise<void> {
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    await client.query(`SET LOCAL search_path TO ${quoteSchema(schema)}`);
    await action(client);
    await client.query('COMMIT');
  } catch (cause) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // The original migration failure is the useful diagnostic; the connection is released below.
      }
    }
    throw new MigrationError(failureCode, `Migration transaction failed: ${migrationId}`, {
      cause,
    });
  } finally {
    client.release();
  }
}

/** Returns applied and pending migrations after verifying every recorded checksum. */
export async function getMigrationStatus(
  pool: Pool,
  options: MigrationOptions = {},
): Promise<MigrationStatus[]> {
  const resolved = resolveOptions(options);
  const migrations = await listMigrations(resolved.directory);
  await ensureLedger(pool, resolved.schema);
  const ledger = await readLedger(pool, resolved.schema);
  assertLedgerMatchesFiles(migrations, ledger);
  const appliedById = new Map(ledger.map((row) => [row.migration_id, row]));
  return migrations.map((migration) => {
    const row = appliedById.get(migration.id);
    return {
      id: migration.id,
      checksum: migration.checksum,
      applied: row !== undefined,
      appliedAt: row?.applied_at.toISOString() ?? null,
    };
  });
}

/** Applies each pending migration and its checksum ledger row in one database transaction. */
export async function applyMigrations(
  pool: Pool,
  options: MigrationOptions = {},
): Promise<string[]> {
  const resolved = resolveOptions(options);
  const migrations = await listMigrations(resolved.directory);
  await ensureLedger(pool, resolved.schema);
  const ledger = await readLedger(pool, resolved.schema);
  assertLedgerMatchesFiles(migrations, ledger);
  const applied = new Set(ledger.map((row) => row.migration_id));
  const pending = migrations.filter((migration) => !applied.has(migration.id));
  const table = ledgerName(resolved.schema);

  for (const migration of pending) {
    await withMigrationTransaction(
      pool,
      resolved.schema,
      async (client) => {
        await client.query(migration.upSql);
        await client.query(`INSERT INTO ${table} (migration_id, checksum) VALUES ($1, $2)`, [
          migration.id,
          migration.checksum,
        ]);
      },
      'MIGRATION_APPLY_FAILED',
      migration.id,
    );
  }
  return pending.map((migration) => migration.id);
}

/** Rolls back the latest applied migrations, atomically pairing each `down` file with its ledger delete. */
export async function rollbackMigrations(
  pool: Pool,
  count = 1,
  options: MigrationOptions = {},
): Promise<string[]> {
  if (!Number.isInteger(count) || count < 1) {
    throw new MigrationError('ROLLBACK_COUNT_INVALID', 'Rollback count must be a positive integer');
  }
  const resolved = resolveOptions(options);
  const migrations = await listMigrations(resolved.directory);
  await ensureLedger(pool, resolved.schema);
  const ledger = await readLedger(pool, resolved.schema);
  assertLedgerMatchesFiles(migrations, ledger);
  if (count > ledger.length) {
    throw new MigrationError(
      'ROLLBACK_COUNT_EXCEEDS_APPLIED',
      'Rollback count exceeds applied migrations',
    );
  }

  const byId = new Map(migrations.map((migration) => [migration.id, migration]));
  const targets = [...ledger]
    .sort((left, right) => right.migration_id.localeCompare(left.migration_id))
    .slice(0, count);
  const table = ledgerName(resolved.schema);

  for (const row of targets) {
    const migration = byId.get(row.migration_id);
    if (!migration) {
      throw new MigrationError(
        'APPLIED_MIGRATION_MISSING',
        `Applied migration file is missing: ${row.migration_id}`,
      );
    }
    await withMigrationTransaction(
      pool,
      resolved.schema,
      async (client) => {
        await client.query(migration.downSql);
        await client.query(`DELETE FROM ${table} WHERE migration_id = $1`, [migration.id]);
      },
      'MIGRATION_ROLLBACK_FAILED',
      migration.id,
    );
  }
  return targets.map((row) => row.migration_id);
}
