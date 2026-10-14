import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvironment } from './lib/load-environment.mjs';
import { requireNode24 } from './lib/require-node24.mjs';

if (!requireNode24('bun run dev')) process.exit(1);

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const requireFromRoot = createRequire(join(root, 'package.json'));
const tscEntry = requireFromRoot.resolve('typescript/bin/tsc');
const childEnvironment = loadEnvironment(root);

const initialBuild = spawnSync(process.execPath, [tscEntry, '--build', 'tsconfig.json'], {
  cwd: root,
  env: childEnvironment,
  stdio: 'inherit',
  windowsHide: true,
});
if (initialBuild.error) {
  process.stderr.write(
    `Could not start the Node.js TypeScript build: ${initialBuild.error.message}\n`,
  );
  process.exit(1);
}
if (initialBuild.status !== 0) process.exit(initialBuild.status ?? 1);

const apiHost = childEnvironment.API_HOST ?? '127.0.0.1';
const services = [
  {
    name: 'core API',
    directory: 'apps/api',
    serviceName: 'api',
    port: childEnvironment.API_PORT ?? '3000',
    runtime: 'node',
  },
  {
    name: 'Relation Service',
    directory: 'services/relation',
    serviceName: 'relation',
    port: childEnvironment.RELATION_PORT ?? '3001',
    runtime: 'node',
  },
  {
    name: 'SOS Service',
    directory: 'services/sos',
    serviceName: 'sos',
    port: childEnvironment.SOS_PORT ?? '3002',
    runtime: 'node',
  },
  { name: 'web application', directory: 'apps/web', runtime: 'bun' },
];
const children = new Set();
let stopping = false;

function stopAll(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill(signal);
}

function watchChild(child, name) {
  children.add(child);
  child.on('error', () => {
    process.stderr.write(
      `Could not start ${name}; confirm Node.js 24, Bun 1.4.3, and the workspace install.\n`,
    );
    process.exitCode = 1;
    stopAll();
  });
  child.on('exit', (code) => {
    children.delete(child);
    if (!stopping) {
      process.stderr.write(
        `${name} exited unexpectedly${code === 0 ? '' : ` (code ${code ?? 'unknown'})`}.\n`,
      );
      process.exitCode = code ?? 1;
      stopAll();
    }
    if (children.size === 0) process.exitCode ??= 0;
  });
}

const compiler = spawn(
  process.execPath,
  [tscEntry, '--build', '--watch', '--preserveWatchOutput'],
  {
    cwd: root,
    env: childEnvironment,
    stdio: 'inherit',
    windowsHide: true,
  },
);
watchChild(compiler, 'TypeScript watch compiler');

for (const service of services) {
  const environment = { ...childEnvironment };
  let command;
  let args;
  if (service.runtime === 'node') {
    environment.SERVICE_NAME = service.serviceName;
    environment.API_HOST = apiHost;
    environment.API_PORT = service.port;
    command = process.execPath;
    args = ['--watch', 'dist/index.js'];
  } else {
    command = 'bun';
    args = ['run', 'dev'];
  }
  const child = spawn(command, args, {
    cwd: resolve(root, service.directory),
    env: environment,
    stdio: 'inherit',
    windowsHide: true,
  });
  watchChild(child, service.name);
}

process.once('SIGINT', () => stopAll('SIGINT'));
process.once('SIGTERM', () => stopAll('SIGTERM'));
