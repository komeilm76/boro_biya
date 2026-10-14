import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const applicationRoots = ['apps', 'services', 'packages'].map((path) => join(root, path));
const sourceExtensions = new Set(['.js', '.mjs', '.ts', '.tsx', '.vue']);
const forbidden = [
  { name: 'Bun runtime global', pattern: /\bBun\s*\./ },
  { name: 'Bun module import', pattern: /(?:from\s*|import\s*)['"]bun:/ },
  { name: 'Bun-only entry-point flag', pattern: /\bimport\.meta\.main\b/ },
];
const findings = [];

function collect(directory) {
  const files = [];
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory)) {
    if (['node_modules', 'dist', 'coverage'].includes(entry)) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...collect(path));
    else if (sourceExtensions.has(extname(path))) files.push(path);
  }
  return files;
}

const sourceFiles = applicationRoots.flatMap(collect);
for (const path of sourceFiles) {
  const rel = path.slice(root.length + 1).replaceAll('\\', '/');
  readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .forEach((line, index) => {
      for (const entry of forbidden) {
        if (entry.pattern.test(line)) findings.push(`${rel}:${index + 1}: ${entry.name}`);
      }
    });
}

if (findings.length > 0) {
  for (const finding of findings) process.stderr.write(`[runtime] ${finding}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `runtime source check passed: ${sourceFiles.length} application and package source files; no Bun-only runtime API (checker ${process.version})\n`,
  );
}

if (!process.argv.includes('--smoke') || findings.length > 0) process.exit();

if (Number(process.versions.node.split('.')[0]) !== 24) {
  process.stderr.write(`Node 24 smoke requires Node 24, found ${process.version}\n`);
  process.exit(1);
}

const required = [
  'apps/api/dist/index.js',
  'services/relation/dist/index.js',
  'services/sos/dist/index.js',
  'apps/web/dist/index.html',
];
const missing = required.filter((path) => !existsSync(join(root, path)));
if (missing.length > 0) {
  process.stderr.write(`[runtime] build artefacts missing: ${missing.join(', ')}\n`);
  process.exit(1);
}

async function freePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Could not allocate an ephemeral port');
  await new Promise((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  return address.port;
}

async function startAndCheck(label, script, portVariable, endpoint, defaultPort) {
  const port = await freePort();
  const child = spawn(process.execPath, [script], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      API_HOST: '127.0.0.1',
      API_PORT: String(port),
      WEB_PORT: String(port),
      [portVariable]: String(port),
      LOG_LEVEL: 'silent',
      SERVICE_NAME: label,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  });
  let stderr = '';
  child.stderr?.on('data', (chunk) => {
    stderr = `${stderr}${chunk.toString('utf8')}`.slice(-3_000);
  });
  const url = `http://127.0.0.1:${port}${endpoint}`;
  const startedAt = Date.now();
  try {
    while (Date.now() - startedAt < 10_000) {
      if (child.exitCode !== null) throw new Error(`process exited with ${child.exitCode}`);
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(500) });
        if (response.ok) {
          await response.arrayBuffer();
          return { child, label };
        }
      } catch {
        await delay(100);
      }
      await delay(100);
    }
    throw new Error('health request timed out');
  } catch (error) {
    child.kill('SIGTERM');
    const reason = error instanceof Error ? error.message : 'unknown failure';
    throw new Error(
      `${label} did not pass a Node smoke request on ${defaultPort}: ${reason}\n${stderr}`,
      { cause: error },
    );
  }
}

function checkInvalidConfiguration() {
  const environment = {
    ...process.env,
    NODE_ENV: 'test',
    SERVICE_NAME: 'api',
    API_PORT: '70000',
    LOG_LEVEL: 'silent',
  };
  delete environment.DATABASE_URL;
  const result = spawnSync(process.execPath, ['apps/api/dist/index.js'], {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    timeout: 5_000,
    windowsHide: true,
  });
  if (
    result.error ||
    result.status !== 1 ||
    !result.stderr?.includes('API failed to start; check validated configuration and service logs.')
  ) {
    throw new Error('API did not reject invalid configuration before starting');
  }
}

const started = [];
try {
  checkInvalidConfiguration();
  process.stdout.write('PASS: API rejected an invalid port before starting\n');
  started.push(await startAndCheck('api', 'apps/api/dist/index.js', 'API_PORT', '/healthz', 3000));
  started.push(
    await startAndCheck(
      'relation',
      'services/relation/dist/index.js',
      'API_PORT',
      '/healthz',
      3001,
    ),
  );
  started.push(
    await startAndCheck('sos', 'services/sos/dist/index.js', 'API_PORT', '/healthz', 3002),
  );
  started.push(await startAndCheck('web', 'apps/web/serve.mjs', 'WEB_PORT', '/', 4173));
  process.stdout.write(
    'Node 24 artefact smoke passed: API, Relation Service, SOS Service, and web shell started and answered health requests\n',
  );
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown runtime smoke failure';
  process.stderr.write(`[runtime] ${message}\n`);
  process.exitCode = 1;
} finally {
  for (const service of started) service.child.kill('SIGTERM');
  await Promise.all(
    started.map(({ child }) =>
      Promise.race([
        new Promise((resolveClose) => child.once('close', resolveClose)),
        delay(3_000),
      ]),
    ),
  );
  for (const { child } of started) if (child.exitCode === null) child.kill('SIGKILL');
}
