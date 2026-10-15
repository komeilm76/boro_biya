#!/usr/bin/env node
/**
 * Migration entry point used by the documented commands (`bun run db:migrate`, `db:status`,
 * `db:rollback`). Ensures the db workspace is built, then hands every argument through to the
 * `boro-db` CLI (packages/db), which loads `.env` on its own and never prints a credential
 * (SEC-13). Dependency-free Node (GOV-45).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(ROOT, 'packages', 'db', 'dist', 'cli.js');

if (!existsSync(CLI)) {
  process.stdout.write('db: building @boro-biya/db (first run)...\n');
  const build = spawnSync(process.execPath, [join(ROOT, 'scripts', 'build.mjs'), '--filter=@boro-biya/db'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (build.status !== 0 || !existsSync(CLI)) {
    process.stderr.write('db: build failed; the migration CLI is not available.\n');
    process.exit(1);
  }
}

const result = spawnSync(process.execPath, [CLI, ...process.argv.slice(2)], { cwd: ROOT, stdio: 'inherit' });
process.exit(result.status ?? 1);
