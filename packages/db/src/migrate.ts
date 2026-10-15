import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type pg from 'pg';
import { assertSafeIdentifier } from './identifiers.js';

/**
 * The versioned, reversible migration framework (OPS-20, QA-15).
 *
 * - Migrations are numbered files: `NNNN_name.up.sql` with a mandatory `NNNN_name.down.sql`.
 *   A migration without a reversal is rejected by the runner; when a genuinely irreversible
 *   change arrives in a later phase, the runbook register (OPS-81) gains a forward-fix entry and
 *   the runner grows an explicit, reviewed escape hatch — never a silent one.
 * - Each migration runs inside a transaction with its ledger row, so a failure leaves no partial
 *   application (QA-93: failed releases roll back cleanly).
 * - The ledger records a SHA-256 checksum of the applied file; a changed checksum is treated as
 *   tampering and fails closed (QA-49: migration integrity).
 * - A session-level advisory lock serializes concurrent migrators against one database.
 */
export interface Migration {
  version: number;
  name: string;
  upSql: string;
  downSql: string;
  checksum: string;
}

const MIGRATION_FILE = /^(\d{4})_([a-z0-9_]+)\.(up|down)\.sql$/;

/** Fixed lock key so every migrator of this product contends on the same advisory lock. */
const MIGRATION_ADVISORY_LOCK_KEY = 7_204_917;

export function readMigrations(dir: string): Migration[] {
  const found = new Map<number, Partial<Migration> & { version: number; name: string }>();
  for (const entry of readdirSync(dir)) {
    const match = MIGRATION_FILE.exec(entry);
    if (!match) continue;
    const [, digits, name, direction] = match as unknown as [string, string, string, 'up' | 'down'];
    const version = Number(digits);
    const existing = found.get(version);
    if (existing !== undefined && existing.name !== name) {
      throw new Error(`migration ${digits} has two different names in ${dir}: ${existing.name}, ${name}`);
    }
    const sql = readFileSync(join(dir, entry), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const record = existing ?? { version, name };
    if (direction === 'up') {
      record.upSql = sql;
      record.checksum = checksum;
    } else {
      record.downSql = sql;
    }
    found.set(version, record);
  }
  const migrations = [...found.values()].sort((a, b) => a.version - b.version);
  for (const migration of migrations) {
    if (migration.upSql === undefined || migration.downSql === undefined) {
      throw new Error(
        `migration ${String(migration.version).padStart(4, '0')}_${migration.name} in ${dir} needs both an .up.sql and a .down.sql file (QA-93: every migration has a rollback or a documented forward-fix)`,
      );
    }
  }
  return migrations as Migration[];
}

export interface MigrationRunOptions {
  /** Target schema; also the home of the ledger table. */
  schema: string;
  migrationsDir: string;
  /** Called with human-readable progress lines (the CLI prints them; tests capture them). */
  log?: (line: string) => void;
}

export interface AppliedMigration {
  version: number;
  name: string;
  checksum: string;
  appliedAt: string;
}

async function withAdvisoryLock<T>(client: pg.PoolClient, run: () => Promise<T>): Promise<T> {
  await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_ADVISORY_LOCK_KEY]);
  try {
    return await run();
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_ADVISORY_LOCK_KEY]);
  }
}

function ledgerTable(schema: string): string {
  return `${assertSafeIdentifier(schema, 'schema')}.schema_migrations`;
}

async function ensureLedger(client: pg.PoolClient, schema: string): Promise<void> {
  const safeSchema = assertSafeIdentifier(schema, 'schema');
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${safeSchema}`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${ledgerTable(safeSchema)} (
      version integer PRIMARY KEY,
      name text NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function readApplied(client: pg.PoolClient, schema: string): Promise<Map<number, AppliedMigration>> {
  const result = await client.query(
    `SELECT version, name, checksum, applied_at FROM ${ledgerTable(schema)} ORDER BY version`,
  );
  const applied = new Map<number, AppliedMigration>();
  for (const row of result.rows as Array<Record<string, unknown>>) {
    applied.set(Number(row['version']), {
      version: Number(row['version']),
      name: String(row['name']),
      checksum: String(row['checksum']),
      appliedAt: row['applied_at'] instanceof Date ? row['applied_at'].toISOString() : String(row['applied_at']),
    });
  }
  return applied;
}

export interface MigrateUpResult {
  applied: number[];
  alreadyApplied: number;
}

/** Apply every pending migration in order, each in its own transaction. */
export async function migrateUp(pool: pg.Pool, options: MigrationRunOptions): Promise<MigrateUpResult> {
  const migrations = readMigrations(options.migrationsDir);
  const schema = assertSafeIdentifier(options.schema, 'schema');
  const log = options.log ?? (() => undefined);
  const client = await pool.connect();
  try {
    return await withAdvisoryLock(client, async () => {
      await ensureLedger(client, schema);
      const applied = await readApplied(client, schema);
      const result: MigrateUpResult = { applied: [], alreadyApplied: applied.size };
      for (const migration of migrations) {
        const recorded = applied.get(migration.version);
        if (recorded !== undefined) {
          if (recorded.checksum !== migration.checksum) {
            throw new Error(
              `migration ${String(migration.version).padStart(4, '0')}_${migration.name} changed after it was applied ` +
                '(checksum mismatch); an applied migration is immutable — add a new migration instead (QA-49)',
            );
          }
          continue;
        }
        await client.query('BEGIN');
        try {
          await client.query(migration.upSql);
          await client.query(`INSERT INTO ${ledgerTable(schema)} (version, name, checksum) VALUES ($1, $2, $3)`, [
            migration.version,
            migration.name,
            migration.checksum,
          ]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw new Error(
            `migration ${String(migration.version).padStart(4, '0')}_${migration.name} failed and was rolled back: ${
              (error as Error).message
            }`,
            { cause: error },
          );
        }
        result.applied.push(migration.version);
        log(`applied ${String(migration.version).padStart(4, '0')}_${migration.name} (schema ${schema})`);
      }
      return result;
    });
  } finally {
    client.release();
  }
}

export interface MigrateDownOptions extends MigrationRunOptions {
  /** Number of migrations to reverse; defaults to 1. */
  steps?: number;
  /** Reverse down to (and excluding) this version; overrides `steps`. */
  toVersion?: number;
}

/** Reverse applied migrations newest-first, each in its own transaction. */
export async function migrateDown(pool: pg.Pool, options: MigrateDownOptions): Promise<number[]> {
  const migrations = readMigrations(options.migrationsDir);
  const schema = assertSafeIdentifier(options.schema, 'schema');
  const log = options.log ?? (() => undefined);
  const client = await pool.connect();
  try {
    return await withAdvisoryLock(client, async () => {
      await ensureLedger(client, schema);
      const applied = await readApplied(client, schema);
      const targets = [...applied.values()]
        .sort((a, b) => b.version - a.version)
        .filter((entry) => {
          if (options.toVersion !== undefined) return entry.version > options.toVersion;
          return true;
        });
      const limit = options.toVersion !== undefined ? targets.length : (options.steps ?? 1);
      const reversed: number[] = [];
      for (const entry of targets.slice(0, limit)) {
        const migration = migrations.find((candidate) => candidate.version === entry.version);
        if (migration === undefined) {
          throw new Error(
            `applied migration ${entry.version}_${entry.name} has no file in ${options.migrationsDir}; cannot reverse what cannot be read (fail closed)`,
          );
        }
        if (migration.checksum !== entry.checksum) {
          throw new Error(
            `migration ${entry.version}_${entry.name} changed since it was applied (checksum mismatch); resolve before rolling back (QA-49)`,
          );
        }
        await client.query('BEGIN');
        try {
          // The ledger row goes first: a rollback may legitimately drop the schema that hosts
          // the ledger (the Phase 1 bootstrap migrations do). Both statements share one
          // transaction, so a failing rollback restores the row and the database is unchanged.
          await client.query(`DELETE FROM ${ledgerTable(schema)} WHERE version = $1`, [entry.version]);
          await client.query(migration.downSql);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw new Error(
            `rollback of ${String(entry.version).padStart(4, '0')}_${entry.name} failed and was rolled back: ${
              (error as Error).message
            }`,
            { cause: error },
          );
        }
        reversed.push(entry.version);
        log(`reversed ${String(entry.version).padStart(4, '0')}_${entry.name} (schema ${schema})`);
      }
      return reversed;
    });
  } finally {
    client.release();
  }
}

export interface MigrationStatus {
  version: number;
  name: string;
  applied: boolean;
  appliedAt?: string;
  checksumMatches: boolean | null;
}

/** Report applied and pending migrations without changing anything. */
export async function migrationStatus(pool: pg.Pool, options: MigrationRunOptions): Promise<MigrationStatus[]> {
  const migrations = readMigrations(options.migrationsDir);
  const schema = assertSafeIdentifier(options.schema, 'schema');
  const client = await pool.connect();
  try {
    await ensureLedger(client, schema);
    const applied = await readApplied(client, schema);
    return migrations.map((migration) => {
      const recorded = applied.get(migration.version);
      return {
        version: migration.version,
        name: migration.name,
        applied: recorded !== undefined,
        ...(recorded !== undefined ? { appliedAt: recorded.appliedAt } : {}),
        checksumMatches: recorded === undefined ? null : recorded.checksum === migration.checksum,
      };
    });
  } finally {
    client.release();
  }
}
