import { appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { requireNode24 } from '../lib/require-node24.mjs';

if (!requireNode24('Rollback exercise')) process.exit(1);

const apiManifest = fileURLToPath(new URL('../../apps/api/package.json', import.meta.url));
const migrationsDirectory = fileURLToPath(new URL('../../apps/api/migrations/', import.meta.url));
const migrationModule = await import(new URL('../../apps/api/dist/db/migrate.js', import.meta.url));
const { applyMigrations, getMigrationStatus, rollbackMigrations } = migrationModule;
const { Pool } = createRequire(apiManifest)('pg');
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  process.stderr.write(
    'Rollback exercise requires DATABASE_URL for a disposable development/test database.\n',
  );
  process.exit(1);
}
if (process.env.ROLLBACK_EXERCISE_CONFIRM !== 'disposable') {
  process.stderr.write(
    'Refusing to run. Set ROLLBACK_EXERCISE_CONFIRM=disposable only after confirming the target is disposable.\n',
  );
  process.exit(1);
}
if (process.env.NODE_ENV === 'production') {
  process.stderr.write('Rollback exercise is prohibited when NODE_ENV=production.\n');
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 2_000 });
const schema = `phase1_rollback_exercise_${randomBytes(8).toString('hex')}`;
let schemaCreated = false;
let exercisePassed = false;
let databaseName = 'unknown';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function metadataTableExists() {
  const result = await pool.query(
    'SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2) AS exists',
    [schema, 'service_metadata'],
  );
  return result.rows[0]?.exists === true;
}

async function migrationRowCount() {
  const result = await pool.query(
    `SELECT count(*)::integer AS count FROM "${schema}"."schema_migrations"`,
  );
  return result.rows[0]?.count ?? 0;
}

try {
  const identity = await pool.query('SELECT current_database() AS database_name');
  databaseName = identity.rows[0]?.database_name ?? 'unknown';
  assert(
    typeof databaseName === 'string' &&
      /^boro_biya_(?:dev|ci|test)(?:_[a-z0-9]+)?$/i.test(databaseName),
    'Target database name must be boro_biya_dev, boro_biya_ci, or boro_biya_test (optionally suffixed for isolation)',
  );

  process.stdout.write(
    `Rollback exercise: disposable database ${databaseName}; isolated schema ${schema}\n`,
  );
  await pool.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;

  const initialStatus = await getMigrationStatus(pool, { directory: migrationsDirectory, schema });
  assert(
    initialStatus.length === 1 && initialStatus[0]?.id === '0001_core_metadata',
    'Expected the Phase 1 core metadata migration',
  );
  assert(
    initialStatus[0]?.applied === false,
    'Fresh exercise schema unexpectedly contains an applied migration',
  );

  const applied = await applyMigrations(pool, { directory: migrationsDirectory, schema });
  assert(
    applied.length === 1 && applied[0] === '0001_core_metadata',
    'The Phase 1 migration did not apply',
  );
  assert(await metadataTableExists(), 'The up migration did not create service_metadata');
  assert((await migrationRowCount()) === 1, 'The migration ledger did not record the up migration');
  process.stdout.write('PASS: applied 0001_core_metadata and verified the table and ledger row\n');

  const rolledBack = await rollbackMigrations(pool, 1, { directory: migrationsDirectory, schema });
  assert(
    rolledBack.length === 1 && rolledBack[0] === '0001_core_metadata',
    'The Phase 1 migration did not roll back',
  );
  assert(!(await metadataTableExists()), 'The down migration left service_metadata behind');
  assert((await migrationRowCount()) === 0, 'The rollback left an applied migration ledger row');
  process.stdout.write(
    'PASS: rolled back 0001_core_metadata and verified the table and ledger row were removed\n',
  );

  const reapplied = await applyMigrations(pool, { directory: migrationsDirectory, schema });
  assert(
    reapplied.length === 1 && reapplied[0] === '0001_core_metadata',
    'The migration did not reapply after rollback',
  );
  assert(await metadataTableExists(), 'The re-applied migration did not restore service_metadata');
  assert((await migrationRowCount()) === 1, 'The re-applied migration was not recorded');
  process.stdout.write('PASS: reapplied the migration successfully after rollback\n');
  exercisePassed = true;
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown rollback exercise failure';
  process.stderr.write(`Rollback exercise failed: ${message}\n`);
  process.exitCode = 1;
} finally {
  if (schemaCreated) {
    try {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      process.stdout.write(`Cleaned up isolated schema ${schema}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown cleanup failure';
      process.stderr.write(`Could not clean up exercise schema ${schema}: ${message}\n`);
      process.exitCode = 1;
    }
  }
  await pool.end();
}

if (exercisePassed && process.exitCode !== 1) {
  process.stdout.write('ROLLBACK EXERCISE PASSED; no application schema or data was changed.\n');
}
if (process.env.GITHUB_STEP_SUMMARY) {
  const status = exercisePassed && process.exitCode !== 1 ? 'passed' : 'failed';
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## Phase 1 migration rollback exercise\n\n- Result: **${status}**\n- Database: \`${databaseName}\`\n- Isolated schema: \`${schema}\`\n- Verified sequence: apply, verify table and ledger; rollback, verify removal; reapply, verify restoration; clean up isolated schema.\n- Command: \`bun run ops:exercise-rollback\`\n`,
  );
}
