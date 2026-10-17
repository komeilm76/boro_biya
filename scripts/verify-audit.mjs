#!/usr/bin/env node
// Application-owned, read-only audit verifier. Build first; keep checkpoint output in an
// independently controlled location, not in the database whose integrity it anchors.
import { readFileSync } from 'node:fs';
import { createDb } from '../packages/db/dist/index.js';
import { parseAuditCheckpoint, verifyAuditIntegrity } from '../apps/api/dist/audit/integrity.js';
let db;
try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] && !args[0].startsWith('--checkpoint='))) throw new Error('arguments');
  const anchor = args[0]
    ? parseAuditCheckpoint(JSON.parse(readFileSync(args[0].slice('--checkpoint='.length), 'utf8')))
    : undefined;
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) throw new Error('configuration');
  db = createDb({ connectionString, max: 1, applicationName: 'boro-audit-verifier' });
  const checkpoint = await verifyAuditIntegrity(db, anchor);
  process.stdout.write(`${JSON.stringify(checkpoint)}\n`);
} catch {
  // Never print driver messages, connection strings or audit payloads.
  process.stderr.write('audit verification failed; check configuration, checkpoint and database integrity\n');
  process.exitCode = 1;
} finally {
  await db?.close();
}
