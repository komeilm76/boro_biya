#!/usr/bin/env node
// Sensitive local operator output, not application logs or a public endpoint.
import { createDb } from '../packages/db/dist/index.js';
import { readSecurityReports } from '../apps/api/dist/security/reports.js';
let db;
try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] && !args[0].startsWith('--before=')) || !process.env['DATABASE_URL'])
    throw new Error('configuration');
  db = createDb({
    connectionString: process.env['DATABASE_URL'],
    max: 1,
    applicationName: 'boro-security-report-reader',
  });
  process.stdout.write(`${JSON.stringify(await readSecurityReports(db, args[0]?.slice('--before='.length)))}\n`);
} catch {
  process.stderr.write('security report inspection failed; check configuration and cursor\n');
  process.exitCode = 1;
} finally {
  await db?.close();
}
