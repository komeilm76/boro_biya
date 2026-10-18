#!/usr/bin/env node
// A selected unit's deployment job. Does not initialise other services or change the shared runner.
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const pg = createRequire(new URL('../../packages/db/package.json', import.meta.url))('pg');
import { migrateUp, migrateDown, migrationStatus } from '../../packages/db/dist/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [service, command] = process.argv.slice(2);
if (!['core', 'relation', 'sos'].includes(service) || !['up', 'down', 'status'].includes(command)) {
  console.error('usage: node scripts/services/migrate.mjs core|relation|sos up|down|status');
  process.exit(1);
}
if (!process.env.DB_ADMIN_URL || (command === 'up' && !process.env.SERVICE_DB_PASSWORD)) {
  console.error('DB_ADMIN_URL is required; up also requires SERVICE_DB_PASSWORD. No credentials are printed.');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DB_ADMIN_URL, max: 1, connectionTimeoutMillis: 5_000 });
try {
  const options = { schema: service, migrationsDir: join(root, 'services', service, 'migrations') };
  if (command === 'up') {
    const role = `boro_${service}`;
    // Fixed service allowlist; quote only deployment-provided passwords, never user input.
    const password = process.env.SERVICE_DB_PASSWORD;
    if (password.includes('\0')) throw new Error('invalid password');
    if ((await pool.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])).rowCount === 0)
      await pool.query(`CREATE ROLE ${role} LOGIN`);
    await pool.query(`ALTER ROLE ${role} LOGIN PASSWORD ${pg.escapeLiteral(password)}`);
    console.log(JSON.stringify(await migrateUp(pool, options)));
  } else if (command === 'down') console.log(JSON.stringify(await migrateDown(pool, { ...options, steps: 1 })));
  else console.log(JSON.stringify(await migrationStatus(pool, options)));
} catch {
  console.error('Service migration failed; inspect the deployment database safely. No connection details are printed.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
