import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvironment } from './lib/load-environment.mjs';
import { requireNode24 } from './lib/require-node24.mjs';

if (!requireNode24('Database commands')) process.exit(1);

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const requireFromRoot = createRequire(join(root, 'package.json'));
const tscEntry = requireFromRoot.resolve('typescript/bin/tsc');
const environment = loadEnvironment(root);

const [command, ...argumentsForCli] = process.argv.slice(2);
if (!['status', 'migrate', 'rollback'].includes(command ?? '')) {
  process.stderr.write('Usage: node scripts/db.mjs <status|migrate|rollback> [rollback-count]\n');
  process.exit(2);
}

const build = spawnSync(process.execPath, [tscEntry, '--build', 'tsconfig.json'], {
  cwd: root,
  env: environment,
  stdio: 'inherit',
  windowsHide: true,
});
if (build.error) {
  process.stderr.write(`Could not start the Node.js TypeScript build: ${build.error.message}\n`);
  process.exit(1);
}
if (build.status !== 0) process.exit(build.status ?? 1);

const databaseCommand = spawnSync(
  process.execPath,
  ['apps/api/dist/db/cli.js', command, ...argumentsForCli],
  { cwd: root, env: environment, stdio: 'inherit', windowsHide: true },
);
if (databaseCommand.error) {
  process.stderr.write(
    `Could not start the Node.js database command: ${databaseCommand.error.message}\n`,
  );
  process.exit(1);
}
process.exitCode = databaseCommand.status ?? 1;
