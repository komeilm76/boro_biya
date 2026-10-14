import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadEnvironment } from '../lib/load-environment.mjs';
import { requireNode24 } from '../lib/require-node24.mjs';

if (!requireNode24('Development smoke test')) process.exit(1);

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const environment = loadEnvironment(root);
const apiHost = '127.0.0.1';
const apiPort = Number(environment.API_PORT ?? '3000');
const relationPort = Number(environment.RELATION_PORT ?? '3001');
const sosPort = Number(environment.SOS_PORT ?? '3002');
const webPort = Number(environment.WEB_PORT ?? '5173');
const checks = [
  {
    name: 'API readiness and PostgreSQL',
    url: `http://${apiHost}:${apiPort}/readyz`,
    service: 'api',
  },
  {
    name: 'Relation Service health',
    url: `http://${apiHost}:${relationPort}/healthz`,
    service: 'relation',
  },
  { name: 'SOS Service health', url: `http://${apiHost}:${sosPort}/healthz`, service: 'sos' },
  { name: 'Vite web shell', url: `http://${apiHost}:${webPort}/`, contentType: 'text/html' },
];
const child = spawn('bun', ['run', 'dev'], {
  cwd: root,
  env: environment,
  stdio: 'inherit',
  windowsHide: true,
  detached: process.platform !== 'win32',
});
let closed = false;
let spawnError;
child.on('error', (error) => {
  spawnError = error;
});
child.once('close', () => {
  closed = true;
});

async function checkEndpoint(check) {
  try {
    const response = await fetch(check.url, { signal: AbortSignal.timeout(1_500) });
    if (!response.ok) return false;
    const contentType = response.headers.get('content-type') ?? '';
    if (check.contentType && !contentType.includes(check.contentType)) return false;
    if (check.service) {
      const body = await response.json();
      if (body.service !== check.service || body.status !== 'ok') return false;
    }
    process.stdout.write(`PASS: ${check.name}\n`);
    return true;
  } catch {
    return false;
  }
}

async function waitForServices() {
  const deadline = Date.now() + 90_000;
  const remaining = new Set(checks);
  while (Date.now() < deadline) {
    if (spawnError) throw new Error(`Could not start bun run dev: ${spawnError.message}`);
    if (closed) throw new Error('bun run dev exited before all services became healthy');
    await Promise.all(
      [...remaining].map(async (check) => {
        if (await checkEndpoint(check)) remaining.delete(check);
      }),
    );
    if (remaining.size === 0) return;
    await delay(400);
  }
  throw new Error(
    `Timed out waiting for development services: ${[...remaining].map(({ name }) => name).join(', ')}`,
  );
}

async function stopDevelopmentStack() {
  if (child.pid && !closed) {
    if (process.platform === 'win32') {
      const result = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      if (result.error)
        process.stderr.write(
          `Could not stop the development process tree: ${result.error.message}\n`,
        );
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        // The process may have exited between the liveness check and signal.
      }
    }
  }
  if (!closed) {
    await Promise.race([
      new Promise((resolveClose) => child.once('close', resolveClose)),
      delay(5_000),
    ]);
  }
  if (!closed && child.pid && process.platform !== 'win32') {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      // The process group may already have exited.
    }
  }
}

try {
  if (child.pid === undefined) throw new Error('Could not start bun run dev');
  await waitForServices();
  process.stdout.write(
    'Development smoke passed: the documented Node 24 services and Vite web shell started successfully.\n',
  );
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown development smoke failure';
  process.stderr.write(`[dev-smoke] ${message}\n`);
  process.exitCode = 1;
} finally {
  await stopDevelopmentStack();
}
