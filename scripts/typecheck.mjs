#!/usr/bin/env node
/**
 * Strict type checking for every workspace (QA-04, GOV-56): `tsc --noEmit` per TypeScript
 * project, `vue-tsc` for the Vue SFC surface, and the checked-JS project for the web static
 * server. Dependency-free Node tooling (GOV-45); identical commands run locally and in CI
 * (QA-58).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function bin(name, relative, fromDir) {
  const local = join(fromDir, 'node_modules', ...relative.split('/'));
  if (existsSync(local)) return local;
  const root = join(ROOT, 'node_modules', ...relative.split('/'));
  if (existsSync(root)) return root;
  throw new Error(`cannot resolve ${name} from ${fromDir} or the workspace root`);
}

function run(label, args, cwd) {
  process.stdout.write(`> ${label}\n`);
  const result = spawnSync(process.execPath, args, { cwd, stdio: 'inherit' });
  return result.status === 0;
}

const TS_WORKSPACES = [
  'packages/validation',
  'packages/contracts',
  'packages/config',
  'packages/server-runtime',
  'packages/db',
  'packages/api-client',
  'packages/ui',
  'packages/test-utils',
  'apps/api',
  'services/relation',
  'services/sos',
];

const jobs = [
  {
    label: 'root tools (vitest configuration)',
    args: [bin('tsc', 'typescript/bin/tsc', ROOT), '-p', join(ROOT, 'tsconfig.tools.json')],
    cwd: ROOT,
  },
];
for (const workspace of TS_WORKSPACES) {
  const dir = join(ROOT, workspace);
  jobs.push({
    label: workspace,
    args: [bin('tsc', 'typescript/bin/tsc', dir), '-p', join(dir, 'tsconfig.json')],
    cwd: dir,
  });
}
const webDir = join(ROOT, 'apps/web');
jobs.push(
  {
    label: 'apps/web (vue-tsc: sources, SFCs, tests)',
    args: [bin('vue-tsc', 'vue-tsc/bin/vue-tsc.js', webDir), '--noEmit', '-p', join(webDir, 'tsconfig.json')],
    cwd: webDir,
  },
  {
    label: 'apps/web (vite configuration)',
    args: [bin('tsc', 'typescript/bin/tsc', webDir), '-p', join(webDir, 'tsconfig.node.json')],
    cwd: webDir,
  },
  {
    label: 'apps/web/server (checked JS static server)',
    args: [bin('tsc', 'typescript/bin/tsc', webDir), '-p', join(webDir, 'server/tsconfig.json')],
    cwd: webDir,
  },
  {
    label: 'apps/android (capacitor configuration)',
    args: [
      bin('tsc', 'typescript/bin/tsc', join(ROOT, 'apps/android')),
      '-p',
      join(ROOT, 'apps/android/tsconfig.json'),
    ],
    cwd: join(ROOT, 'apps/android'),
  },
);

let failures = 0;
for (const job of jobs) {
  if (!run(job.label, job.args, job.cwd)) {
    failures += 1;
    process.stderr.write(`✗ ${job.label} failed\n`);
  }
}
if (failures > 0) {
  process.stderr.write(`typecheck failed: ${failures} project(s)\n`);
  process.exit(1);
}
process.stdout.write('typecheck complete: every project passed with the strict flags of GOV-56\n');
