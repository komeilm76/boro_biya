import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const envPath = resolve(root, '.env');
const password = randomBytes(32).toString('hex');
const environment = [
  '# Generated for local development by `bun run setup:dev`.',
  '# This file contains a unique development-only database password. Do not commit or share it.',
  'NODE_ENV=development',
  'SERVICE_NAME=api',
  'API_HOST=127.0.0.1',
  'API_PORT=3000',
  'RELATION_PORT=3001',
  'SOS_PORT=3002',
  'WEB_PORT=5173',
  'API_PUBLISHED_PORT=3000',
  'RELATION_PUBLISHED_PORT=3001',
  'SOS_PUBLISHED_PORT=3002',
  'WEB_PUBLISHED_PORT=5173',
  'POSTGRES_PUBLISHED_PORT=5432',
  'LOG_LEVEL=info',
  'DB_POOL_MAX=10',
  'POSTGRES_USER=boro_biya',
  `POSTGRES_PASSWORD=${password}`,
  'POSTGRES_DB=boro_biya_dev',
  `DATABASE_URL=postgresql://boro_biya:${password}@127.0.0.1:5432/boro_biya_dev`,
  '',
].join('\n');

try {
  await writeFile(envPath, environment, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
} catch (error) {
  if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
    process.stderr.write(
      '.env already exists; it was left unchanged. Remove it only if you intend to generate a new local database credential.\n',
    );
    process.exitCode = 1;
  } else {
    throw error;
  }
}

if (process.exitCode !== 1) {
  process.stdout.write(
    'Created .env with a fresh 256-bit local-only PostgreSQL password; the password was not printed.\n',
  );
  process.stdout.write(
    'Start PostgreSQL with `docker compose up -d db`, then apply migrations with `bun run db:migrate`.\n',
  );
}
