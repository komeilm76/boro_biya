import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const environment = {
  ...process.env,
  POSTGRES_USER: process.env.POSTGRES_USER ?? 'boro_biya',
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD ?? randomBytes(24).toString('hex'),
  POSTGRES_DB: process.env.POSTGRES_DB ?? 'boro_biya_ci',
};

for (const [label, args] of [
  ['docker compose config --quiet', ['compose', 'config', '--quiet']],
  [
    'docker compose build api relation sos web',
    ['compose', 'build', 'api', 'relation', 'sos', 'web'],
  ],
]) {
  process.stdout.write(`> docker ${args.join(' ')}\n`);
  const result = spawnSync('docker', args, {
    cwd: root,
    env: environment,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) {
    process.stderr.write(`${label} could not run: ${result.error.message}\n`);
    process.exit(result.error.code === 'ENOENT' ? 127 : 1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
