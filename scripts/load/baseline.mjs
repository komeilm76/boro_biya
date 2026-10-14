import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { requireNode24 } from '../lib/require-node24.mjs';

if (!requireNode24('Load baseline')) process.exit(1);

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const profile = JSON.parse(
  readFileSync(fileURLToPath(new URL('./baseline-profile.json', import.meta.url)), 'utf8'),
);

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

async function waitForApi(child, url) {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    if (child.exitCode !== null)
      throw new Error(`API exited before readiness (code ${child.exitCode})`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {
      await delay(100);
    }
  }
  throw new Error('API did not become live within 10 seconds');
}

function percentile(sorted, fraction) {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

const port = await freePort();
const child = spawn(process.execPath, ['apps/api/dist/index.js'], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: 'test',
    API_HOST: '127.0.0.1',
    API_PORT: String(port),
    LOG_LEVEL: 'silent',
  },
  stdio: ['ignore', 'ignore', 'pipe'],
  windowsHide: true,
});
let childError = '';
child.stderr?.on('data', (chunk) => {
  childError = `${childError}${chunk.toString('utf8')}`.slice(-4_000);
});

let failed;
try {
  const url = `http://127.0.0.1:${port}/healthz`;
  await waitForApi(child, url);
  const durations = [];
  let nextRequest = 0;
  let errors = 0;
  const started = performance.now();
  const workers = Array.from({ length: profile.concurrency }, async () => {
    while (nextRequest < profile.requests) {
      const requestNumber = nextRequest;
      nextRequest += 1;
      const requestStarted = performance.now();
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
        if (!response.ok) errors += 1;
        await response.arrayBuffer();
      } catch {
        errors += 1;
      }
      durations[requestNumber] = performance.now() - requestStarted;
    }
  });
  await Promise.all(workers);
  const elapsedMilliseconds = performance.now() - started;
  const sorted = durations.toSorted((left, right) => left - right);
  const requestsPerSecond = profile.requests / (elapsedMilliseconds / 1_000);
  const result = {
    requests: profile.requests,
    concurrency: profile.concurrency,
    errors,
    requestsPerSecond: Math.round(requestsPerSecond),
    elapsedMilliseconds: Number(elapsedMilliseconds.toFixed(1)),
    p50Milliseconds: Number(percentile(sorted, 0.5).toFixed(1)),
    p95Milliseconds: Number(percentile(sorted, 0.95).toFixed(1)),
    p99Milliseconds: Number(percentile(sorted, 0.99).toFixed(1)),
    route: profile.route,
    dataset: profile.dataset,
    node: process.version,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  failed =
    errors !== profile.pass.errors ||
    result.requestsPerSecond < profile.pass.requestsPerSecondAtLeast ||
    result.p95Milliseconds > profile.pass.p95MillisecondsAtMost ||
    result.p99Milliseconds > profile.pass.p99MillisecondsAtMost;
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown baseline failure';
  process.stderr.write(`Baseline load profile failed: ${message}\n`);
  if (childError) process.stderr.write(childError);
  failed = true;
} finally {
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolveClose) => child.once('close', resolveClose)),
    delay(3_000),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

if (failed) process.exitCode = 1;
