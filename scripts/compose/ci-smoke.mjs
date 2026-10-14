import { randomBytes } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadEnvironment } from '../lib/load-environment.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const env = loadEnvironment(root);
env.POSTGRES_USER ??= 'boro_biya';
env.POSTGRES_PASSWORD = `ci-${randomBytes(24).toString('hex')}`;
env.POSTGRES_DB = 'boro_biya_ci';
const projectName = `boro-biya-smoke-${randomBytes(6).toString('hex')}`;
const checks = [
  {
    name: 'API readiness and PostgreSQL migration',
    url: `http://127.0.0.1:${env.API_PUBLISHED_PORT ?? '3000'}/readyz`,
    service: 'api',
  },
  {
    name: 'Relation Service health',
    url: `http://127.0.0.1:${env.RELATION_PUBLISHED_PORT ?? '3001'}/healthz`,
    service: 'relation',
  },
  {
    name: 'SOS Service health',
    url: `http://127.0.0.1:${env.SOS_PUBLISHED_PORT ?? '3002'}/healthz`,
    service: 'sos',
  },
  {
    name: 'web shell',
    url: `http://127.0.0.1:${env.WEB_PUBLISHED_PORT ?? '5173'}/`,
    contentType: 'text/html',
  },
];
let stackStarted = false;
let failed = false;

function appendSummary(content) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, content);
}

function runDocker(args, label) {
  process.stdout.write(`> docker compose --project-name ${projectName} ${args.join(' ')}\n`);
  const result = spawnSync('docker', ['compose', '--project-name', projectName, ...args], {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) {
    process.stderr.write(`${label} could not run: ${result.error.message}\n`);
    return result.error.code === 'ENOENT' ? 127 : 1;
  }
  return result.status ?? 1;
}

async function waitForStack() {
  const deadline = Date.now() + 150_000;
  const ready = new Set();
  while (Date.now() < deadline) {
    await Promise.all(
      checks.map(async (check) => {
        if (ready.has(check.name)) return;
        try {
          const response = await fetch(check.url, { signal: AbortSignal.timeout(1_500) });
          if (!response.ok) return;
          const contentType = response.headers.get('content-type') ?? '';
          if (check.contentType && !contentType.includes(check.contentType)) return;
          if (check.service) {
            const body = await response.json();
            if (body.service !== check.service || body.status !== 'ok') return;
          }
          ready.add(check.name);
          process.stdout.write(`PASS: ${check.name}\n`);
        } catch {
          // The services are still starting or the database is not ready.
        }
      }),
    );
    if (ready.size === checks.length) return;
    await delay(500);
  }
  const missing = checks.filter((check) => !ready.has(check.name)).map((check) => check.name);
  throw new Error(`Timed out waiting for Compose health checks: ${missing.join(', ')}`);
}

try {
  if (runDocker(['config', '--quiet'], 'Compose configuration check') !== 0) {
    throw new Error('docker compose config failed');
  }
  stackStarted = true;
  if (runDocker(['up', '--build', '--detach'], 'Compose startup') !== 0) {
    throw new Error('docker compose up --build failed');
  }
  await waitForStack();
  if (runDocker(['ps'], 'Compose status') !== 0) throw new Error('docker compose ps failed');
  process.stdout.write(
    'Compose smoke passed: PostgreSQL, API, Relation Service, SOS Service, and web shell became healthy.\n',
  );
  appendSummary(
    `## Docker Compose smoke\n\n**Result:** passed\n\n${checks.map((check) => `- ${check.name}: ${check.url}`).join('\n')}\n\n**Cleanup:** removed only Compose project \`${projectName}\` and its volumes.\n`,
  );
} catch (error) {
  failed = true;
  const message = error instanceof Error ? error.message : 'Unknown Compose smoke failure';
  process.stderr.write(`[compose] ${message}\n`);
  appendSummary(
    `## Docker Compose smoke\n\n**Result:** failed\n\n**Details:** ${message}\n\n**Project:** \`${projectName}\`\n`,
  );
  if (stackStarted) runDocker(['logs', '--no-color', '--tail', '100'], 'Compose logs');
} finally {
  const cleanup = runDocker(['down', '--volumes', '--remove-orphans'], 'Compose cleanup');
  if (cleanup !== 0) failed = true;
}

if (failed) process.exitCode = 1;
