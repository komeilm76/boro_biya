import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { parseConfig } from '@boro/config';
import { applyMigrations, getMigrationStatus, rollbackMigrations } from './migrate.js';

const migrationsDirectory = fileURLToPath(new URL('../../migrations/', import.meta.url));

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'status';
  const config = parseConfig(process.env);
  if (!config.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for database commands');
  }

  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 2_000,
  });
  try {
    if (command === 'status') {
      const status = await getMigrationStatus(pool, { directory: migrationsDirectory });
      for (const entry of status) {
        process.stdout.write(`${entry.applied ? 'applied' : 'pending'} ${entry.id}\n`);
      }
      if (status.length === 0) process.stdout.write('no migrations found\n');
      return;
    }
    if (command === 'migrate') {
      const applied = await applyMigrations(pool, { directory: migrationsDirectory });
      process.stdout.write(
        applied.length > 0 ? `applied: ${applied.join(', ')}\n` : 'database is current\n',
      );
      return;
    }
    if (command === 'rollback') {
      const rawCount = process.argv[3] ?? '1';
      const count = Number(rawCount);
      if (!Number.isInteger(count) || count < 1) {
        throw new Error('Rollback count must be a positive integer');
      }
      const rolledBack = await rollbackMigrations(pool, count, { directory: migrationsDirectory });
      process.stdout.write(
        rolledBack.length > 0
          ? `rolled back: ${rolledBack.join(', ')}\n`
          : 'nothing to roll back\n',
      );
      return;
    }
    throw new Error(`Unknown database command: ${command}`);
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown database command failure';
  process.stderr.write(`Database command failed: ${message}\n`);
  process.exitCode = 1;
});
