#!/usr/bin/env node
/**
 * Development database WITHOUT Docker: starts the same disposable PostgreSQL 18 binaries the
 * integration tests use (QA-06), in persistent mode under var/pg-dev, then runs the cluster
 * bootstrap (roles, schemas, migrations) exactly like `bun run db:migrate` does against the
 * Compose database. This is the fallback path for environments where Docker is unavailable;
 * the documented default remains `docker compose up -d db` (OPS-66).
 *
 * Reads .env for DB_PORT and the role passwords (run `bun run env:create` first). Stops on
 * SIGINT/SIGTERM; data survives restarts (var/ is git-ignored).
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const artefact of [
  'packages/test-utils/dist/pg/index.js',
  'packages/config/dist/index.js',
  'packages/db/dist/index.js',
]) {
  if (!existsSync(join(ROOT, artefact))) {
    process.stderr.write(`dev-db: ${artefact} is missing — run \`bun run build\` first.\n`);
    process.exit(1);
  }
}

const { readEnvFile } = await import(pathToFileURL(join(ROOT, 'packages/config/dist/index.js')).href);
const { startTestDatabaseServer } = await import(
  pathToFileURL(join(ROOT, 'packages/test-utils/dist/pg/index.js')).href
);
const { initCluster } = await import(pathToFileURL(join(ROOT, 'packages/db/dist/index.js')).href);

const env = readEnvFile(join(ROOT, '.env')) ?? {};
const port = Number(process.env['DB_PORT'] ?? env['DB_PORT'] ?? '5432');
const passwords = {
  core: process.env['CORE_DB_PASSWORD'] ?? env['CORE_DB_PASSWORD'] ?? '',
  relation: process.env['RELATION_DB_PASSWORD'] ?? env['RELATION_DB_PASSWORD'] ?? '',
  sos: process.env['SOS_DB_PASSWORD'] ?? env['SOS_DB_PASSWORD'] ?? '',
};
if (Object.values(passwords).some((value) => value === '')) {
  process.stderr.write('dev-db: CORE/RELATION/SOS_DB_PASSWORD are missing — run `bun run env:create` first.\n');
  process.exit(1);
}

const dataDir = join(ROOT, 'var', 'pg-dev');
mkdirSync(dataDir, { recursive: true });

process.stdout.write(`dev-db: starting persistent PostgreSQL 18 on 127.0.0.1:${port} (data: var/pg-dev)\n`);
const server = await startTestDatabaseServer({ port, persistent: true, databaseDir: dataDir });
const version = await server.serverVersion();
process.stdout.write(`dev-db: PostgreSQL ${version} ready\n`);

const dbName = process.env['POSTGRES_DB'] ?? env['POSTGRES_DB'] ?? 'boro_biya';
const dbAdminUrl = await server.ensureDatabase(dbName);
process.stdout.write(`dev-db: database "${dbName}" ready\n`);

await initCluster({
  adminConnectionString: dbAdminUrl,
  passwords,
  repoRoot: ROOT,
  // Mirror the Compose layout: the POSTGRES_USER/POSTGRES_PASSWORD pair from .env also exists
  // here, so `bun run db:migrate` (DB_ADMIN_URL) works identically against either database.
  adminRole: {
    name: process.env['POSTGRES_USER'] ?? env['POSTGRES_USER'] ?? 'boro_biya',
    password: process.env['POSTGRES_PASSWORD'] ?? env['POSTGRES_PASSWORD'] ?? '',
  },
  log: (line) => process.stdout.write(`dev-db: ${line}\n`),
});
process.stdout.write(
  [
    'dev-db: roles ready and migrations applied.',
    `dev-db: services can connect at postgres://boro_core|boro_relation|boro_sos@127.0.0.1:${port}/${env['POSTGRES_DB'] ?? 'boro_biya'}`,
    'dev-db: the administrative URL uses the boro_test_admin role from the harness.',
    'dev-db: running until SIGINT/SIGTERM; data persists in var/pg-dev.',
  ].join('\n') + '\n',
);

// The admin URL points at the harness user; rewrite it to the .env admin role so `bun run
// db:migrate` style tools and the compose flow agree on identity when they connect.
let stopping = false;
function stop(signal) {
  if (stopping) return;
  stopping = true;
  process.stdout.write(`dev-db: ${signal} received; stopping PostgreSQL (data kept)\n`);
  server.stop().then(
    () => process.exit(0),
    () => process.exit(1),
  );
}
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
setInterval(() => undefined, 5_000);
