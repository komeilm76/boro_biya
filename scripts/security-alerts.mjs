#!/usr/bin/env node
// Read-only operator inspection. Requires a build and the existing DATABASE_URL environment.
import { createDb } from '../packages/db/dist/index.js';
import { readSecurityAlerts } from '../services/core/dist/audit/alerts.js';
let db;
try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] && !args[0].startsWith('--before='))) throw new Error('arguments');
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) throw new Error('configuration');
  db = createDb({ connectionString, max: 1, applicationName: 'boro-security-alert-reader' });
  process.stdout.write(`${JSON.stringify(await readSecurityAlerts(db, args[0]?.slice('--before='.length)))}\n`);
} catch {
  process.stderr.write('security alert inspection failed; check configuration and cursor\n');
  process.exitCode = 1;
} finally {
  await db?.close();
}
