#!/usr/bin/env node
/**
 * Local development runner (docs/development/01-development-environment.md §4): builds the
 * backend workspaces once, then runs the three backends with `node --watch`, TypeScript watch
 * compilations, and the Vite dev server for the web client — all output prefixed per process,
 * all processes terminated together on Ctrl+C. Dependency-free Node (GOV-45), identical on
 * Windows and Linux (OPS-65).
 *
 * Flags:
 *   --no-watch   build once and start the servers without file watchers (lower memory; used by
 *                sandboxed previews and CI smoke runs)
 *   --only=a,b   start only the named processes (api, relation, sos, web)
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const watch = !args.includes('--no-watch');
const onlyArg = args.find((arg) => arg.startsWith('--only='));
const only = onlyArg === undefined ? null : new Set(onlyArg.slice('--only='.length).split(','));

// The backend build must exist before anything runs; build.mjs also proves the graph is acyclic.
const buildArgs = [join(ROOT, 'scripts', 'build.mjs')];
if (only !== null && !only.has('web')) buildArgs.push('--filter=@boro-biya/api');
const build = spawnSync(process.execPath, buildArgs, { cwd: ROOT, stdio: 'inherit' });
if (build.status !== 0) {
  process.stderr.write('dev: backend build failed; fix the errors above and retry.\n');
  process.exit(1);
}

// Reuse the shipped env-file parser from the built config package (single source of truth).
const { readEnvFile } = await import(pathToFileURL(join(ROOT, 'packages', 'config', 'dist', 'env-file.js')).href);
const dotenv = readEnvFile(join(ROOT, '.env')) ?? {};
const envValue = (name, fallback = '') => process.env[name] ?? dotenv[name] ?? fallback;

if (Object.keys(dotenv).length === 0) {
  process.stderr.write('dev: no .env found — run `bun run env:create` first (documented flow).\n');
  process.exit(1);
}

const dbBase = `localhost:${envValue('DB_PORT', '5432')}`;
const dbName = envValue('POSTGRES_DB', 'boro_biya');
const serviceUrl = (role, password) => `postgres://${role}:${password}@${dbBase}/${dbName}`;

const children = [];

function prefixOutput(name, stream, target) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      target.write(`[${name}] ${line}\n`);
    }
  });
  stream.on('end', () => {
    if (buffer !== '') target.write(`[${name}] ${buffer}\n`);
  });
}

function start(name, command, commandArgs, options = {}) {
  if (only !== null && !only.has(name)) return;
  const child = spawn(command, commandArgs, {
    cwd: options.cwd ?? ROOT,
    env: { ...process.env, ...dotenv, ...(options.env ?? {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  prefixOutput(name, child.stdout, process.stdout);
  prefixOutput(name, child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (code !== 0 && code !== null && !shuttingDown) {
      process.stderr.write(`[${name}] exited with code ${code}; stopping the dev stack.\n`);
      stopAll(1);
    }
  });
  children.push({ name, child });
}

const tscBin = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const viteBin = join(ROOT, 'apps', 'web', 'node_modules', 'vite', 'bin', 'vite.js');

const BACKENDS = [
  {
    name: 'api',
    dir: 'apps/api',
    port: envValue('API_PORT', '3000'),
    metricsPort: envValue('METRICS_PORT', '9000'),
    databaseUrl: envValue('DATABASE_URL', serviceUrl('boro_core', envValue('CORE_DB_PASSWORD'))),
  },
  {
    name: 'relation',
    dir: 'services/relation',
    port: envValue('RELATION_PORT', '3001'),
    metricsPort: '9001',
    databaseUrl: serviceUrl('boro_relation', envValue('RELATION_DB_PASSWORD')),
  },
  {
    name: 'sos',
    dir: 'services/sos',
    port: envValue('SOS_PORT', '3002'),
    metricsPort: '9002',
    databaseUrl: serviceUrl('boro_sos', envValue('SOS_DB_PASSWORD')),
  },
];

const WATCHED_PACKAGES = [
  'packages/validation',
  'packages/contracts',
  'packages/config',
  'packages/server-runtime',
  'packages/db',
];

if (watch) {
  for (const workspace of [...WATCHED_PACKAGES, 'apps/api', 'services/relation', 'services/sos']) {
    if (only !== null && !only.has('api') && !only.has('relation') && !only.has('sos')) break;
    const dir = join(ROOT, workspace);
    const tsconfig = existsSync(join(dir, 'tsconfig.build.json')) ? 'tsconfig.build.json' : 'tsconfig.json';
    start(
      `tsc:${workspace}`,
      process.execPath,
      [tscBin, '-p', join(dir, tsconfig), '--watch', '--preserveWatchOutput'],
      { cwd: dir },
    );
  }
}

for (const backend of BACKENDS) {
  start(
    backend.name,
    process.execPath,
    [
      watch ? '--watch' : join(ROOT, backend.dir, 'dist', 'main.js'),
      ...(watch ? [join(ROOT, backend.dir, 'dist', 'main.js')] : []),
    ],
    {
      cwd: join(ROOT, backend.dir),
      env: {
        NODE_ENV: 'development',
        SERVICE_NAME: backend.name,
        API_HOST: envValue('API_HOST', '127.0.0.1'),
        API_PORT: backend.port,
        METRICS_HOST: envValue('METRICS_HOST', '127.0.0.1'),
        METRICS_PORT: backend.metricsPort,
        DATABASE_URL: backend.databaseUrl,
        WEB_ORIGIN: envValue('WEB_ORIGIN', 'http://localhost:5173'),
        ...Object.fromEntries(
          [
            'SESSION_SECRET',
            'ACCESS_TOKEN_TTL_SECONDS',
            'REFRESH_TOKEN_TTL_DAYS',
            'LOGIN_MAX_ATTEMPTS_PER_ACCOUNT',
            'LOGIN_MAX_ATTEMPTS_PER_ORIGIN',
            'LOGIN_WINDOW_SECONDS',
            'LOCKOUT_SECONDS',
            'SECURITY_QUESTIONS_ENABLED',
            'CAPTCHA_ENABLED',
          ]
            .filter((name) => envValue(name) !== '')
            .map((name) => [name, envValue(name)]),
        ),
        CORS_ALLOWED_ORIGINS: envValue('CORS_ALLOWED_ORIGINS', 'http://localhost:5173'),
        BUILD_COMMIT: envValue('BUILD_COMMIT', 'dev'),
      },
    },
  );
}

start('web', process.execPath, [viteBin, '--config', join(ROOT, 'apps/web/vite.config.ts')], {
  cwd: join(ROOT, 'apps/web'),
  env: {
    API_PROXY_TARGET: serviceProxyTarget(),
  },
});

function serviceProxyTarget() {
  return `http://${envValue('API_HOST', '127.0.0.1') === '0.0.0.0' ? '127.0.0.1' : envValue('API_HOST', '127.0.0.1')}:${envValue('API_PORT', '3000')}`;
}

let shuttingDown = false;
function killTree(entry) {
  const { child } = entry;
  if (child.pid === undefined) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

function stopAll(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const entry of children) killTree(entry);
  setTimeout(() => process.exit(code), 500).unref();
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

process.stdout.write(
  [
    'dev stack starting:',
    `  api      http://localhost:${BACKENDS[0].port}   (/healthz, /readyz)`,
    `  relation http://localhost:${BACKENDS[1].port}`,
    `  sos      http://localhost:${BACKENDS[2].port}`,
    `  web      http://localhost:${envValue('VITE_PORT', '5173')}   (proxies /api to the core API)`,
    watch
      ? 'watch mode: tsc watchers rebuild, node --watch restarts the backends.'
      : 'no-watch mode: servers run the freshly built artefacts.',
    'Stop everything with Ctrl+C (SIGINT) or SIGTERM.',
  ].join('\n') + '\n',
);

// Keep the process alive while children run.
const keepAlive = setInterval(() => {
  if (children.length === 0) clearInterval(keepAlive);
}, 1_000);
