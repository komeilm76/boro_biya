#!/usr/bin/env node
// Application maintenance entry, not a scheduler or a general erasure facility.
import { createDb } from '../packages/db/dist/index.js';
import { readAuthConfig } from '../services/core/dist/auth/config.js';
import { runRetentionPass } from '../services/core/dist/privacy/retention.js';
let db;
try {
  if (process.argv.length !== 2 || !process.env['DATABASE_URL']) throw new Error('configuration');
  const config = readAuthConfig();
  db = createDb({ connectionString: process.env['DATABASE_URL'], max: 1, applicationName: 'boro-retention-pass' });
  process.stdout.write(`${JSON.stringify(await runRetentionPass(db, config))}\n`);
} catch {
  process.stderr.write('retention pass failed; check configuration and database availability\n');
  process.exitCode = 1;
} finally {
  await db?.close();
}
