#!/usr/bin/env node
/**
 * Runtime compatibility and portability check (QA-123, ADR-025, GOV-82).
 *
 * Part 1 — source scan (runs on any Node): no Bun-only runtime API is reachable from
 * application code. Forbidden outside an approved adapter: `Bun.` globals, `bun:` module
 * imports, `bun:test` imports, and Deno globals. There is no approved adapter directory yet;
 * when one is created it must be registered in APPROVED_ADAPTERS with the decision that
 * approved it.
 *
 * Part 2 — artefact smoke (requires the pinned runtime): every production artefact is started
 * with Node 24 LTS and smoke-checked: the three backends must answer /healthz (liveness without
 * a reachable database, OPS-59), reject unknown /api/v1 paths with the error envelope (API-11),
 * expose metrics on their own interface (OPS-63), and exit 0 on SIGTERM within the shutdown
 * window (OPS-62). The web artefact must serve the built bundle, fall back to the SPA for
 * unknown client paths (UI-07), and answer 502 with an envelope when its fixed upstream is
 * down. `--scan-only` runs Part 1 alone (useful on a machine that is not the pinned runtime);
 * the full check FAILS when the executing Node major is not the pinned one — an artefact that
 * was not started on the pinned runtime was not verified (fail closed, GOV-18).
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PINNED_NODE_MAJOR = 24;
const SCAN_DIRS = ['apps/api/src', 'apps/web/src', 'services/relation/src', 'services/sos/src', 'packages'];
const APPROVED_ADAPTERS = []; // none exist; see ADR-025 and the header comment
const FORBIDDEN = [
  { pattern: /\bBun\./, label: 'Bun global' },
  { pattern: /from\s+['"]bun:/, label: 'bun: module import' },
  { pattern: /import\(\s*['"]bun:/, label: 'bun: dynamic import' },
  { pattern: /require\(\s*['"]bun:/, label: 'bun: require' },
  { pattern: /\bDeno\./, label: 'Deno global' },
];

const scanOnly = process.argv.includes('--scan-only');
const problems = [];
const evidence = [];

// ------------------------------------------------------------------ Part 1: source scan
function walkSourceFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'test'].includes(entry.name)) continue;
      out.push(...walkSourceFiles(full));
    } else if (/\.(ts|mts|cts|vue|js|mjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

let scanned = 0;
for (const relative of SCAN_DIRS) {
  for (const file of walkSourceFiles(join(ROOT, relative))) {
    const rel = file
      .slice(ROOT.length + 1)
      .split('\\')
      .join('/');
    if (APPROVED_ADAPTERS.some((adapter) => rel.startsWith(adapter))) continue;
    scanned += 1;
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      // This script itself documents the forbidden patterns; source files may quote them in
      // comments only when the comment names the rule — the scan still flags them, so quoted
      // examples must stay out of application sources (they live in this tooling file).
      for (const forbidden of FORBIDDEN) {
        if (forbidden.pattern.test(line)) {
          problems.push(`${rel}:${index + 1} uses ${forbidden.label} outside an approved adapter (GOV-82, ADR-025)`);
        }
      }
    });
  }
}
evidence.push(
  `source scan: ${scanned} files, ${FORBIDDEN.length} forbidden patterns, ${APPROVED_ADAPTERS.length} approved adapters`,
);

// ------------------------------------------------------------------ Part 2: artefact smoke
const actualMajor = Number(process.versions.node.split('.')[0]);
if (!scanOnly && actualMajor !== PINNED_NODE_MAJOR) {
  problems.push(
    `runtime check requires Node ${PINNED_NODE_MAJOR}.x LTS (the pinned production runtime, ADR-025) but this process is Node ${process.versions.node}. ` +
      'Run the full check on the pinned runtime (CI does); `--scan-only` runs the source scan anywhere.',
  );
}

function waitForHealth(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  const poll = async () => {
    while (Date.now() < deadline) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
        if (response.ok) return response;
      } catch {
        // not up yet
      }
      await new Promise((wait) => setTimeout(wait, 250));
    }
    return null;
  };
  return poll();
}

function stopAndWait(child, timeoutMs = 15_000) {
  return new Promise((promiseResolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGKILL');
        promiseResolve({ code: null, graceful: false });
      }
    }, timeoutMs);
    child.on('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        promiseResolve({ code, graceful: true });
      }
    });
    child.kill('SIGTERM');
  });
}

async function smokeBackend(name, mainPath, ports) {
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    SERVICE_NAME: name,
    API_HOST: '127.0.0.1',
    API_PORT: String(ports.api),
    METRICS_HOST: '127.0.0.1',
    METRICS_PORT: String(ports.metrics),
    LOG_LEVEL: 'warn',
    DATABASE_URL: 'postgres://smoke:smoke@127.0.0.1:1/smoke', // deliberately unreachable (OPS-59)
    GRACEFUL_SHUTDOWN_TIMEOUT_SECONDS: '5',
    BUILD_COMMIT: 'runtime-check',
  };
  if (name === 'api') {
    env.WEB_ORIGIN = 'http://localhost:5173';
    env.SESSION_SECRET = 'disposable-runtime-smoke-only-signing-material';
  }
  const child = spawn(process.execPath, [mainPath], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderrTail = '';
  child.stderr.on('data', (chunk) => {
    stderrTail = (stderrTail + String(chunk)).slice(-800);
  });
  try {
    const health = await waitForHealth(`http://127.0.0.1:${ports.api}/healthz`);
    if (health === null) {
      problems.push(
        `${name}: /healthz never answered (liveness must not depend on the database, OPS-59). stderr: ${stderrTail}`,
      );
      return;
    }
    const healthBody = await health.json();
    if (healthBody.status !== 'ok' || healthBody.service !== name || healthBody.commit !== 'runtime-check') {
      problems.push(`${name}: /healthz body is wrong: ${JSON.stringify(healthBody).slice(0, 200)}`);
    }
    if (typeof healthBody.serverTime !== 'string' || !/Z$/.test(healthBody.serverTime)) {
      problems.push(`${name}: /healthz serverTime violates the wire timestamp contract (API-36)`);
    }
    // Readiness must report unavailable (503) with a dead database, never hang or crash.
    const ready = await fetch(`http://127.0.0.1:${ports.api}/readyz`, { signal: AbortSignal.timeout(10_000) }).catch(
      () => null,
    );
    if (ready === null || ready.status !== 503) {
      problems.push(
        `${name}: /readyz with an unreachable database must answer 503 (OPS-59), got ${ready === null ? 'no response' : ready.status}`,
      );
    } else {
      const readyBody = await ready.json();
      if (readyBody.status !== 'unavailable' || readyBody.checks?.database !== false) {
        problems.push(`${name}: /readyz body is wrong: ${JSON.stringify(readyBody).slice(0, 200)}`);
      }
    }
    // Unknown /api/v1 path: envelope 404 with a request identifier (API-11).
    const missing = await fetch(`http://127.0.0.1:${ports.api}/api/v1/definitely-not-a-route`, {
      signal: AbortSignal.timeout(5_000),
    }).catch(() => null);
    if (missing === null || missing.status !== 404) {
      problems.push(
        `${name}: unknown /api/v1 path must answer 404, got ${missing === null ? 'no response' : missing.status}`,
      );
    } else {
      const envelope = await missing.json();
      if (envelope.code !== 'not_found' || typeof envelope.requestId !== 'string' || envelope.requestId === '') {
        problems.push(`${name}: 404 envelope is wrong: ${JSON.stringify(envelope).slice(0, 200)} (API-11)`);
      }
      if (!missing.headers.get('x-correlation-id')) {
        problems.push(`${name}: responses must carry the correlation identifier header (SEC-73)`);
      }
    }
    // Metrics on their own interface (OPS-63).
    const metrics = await fetch(`http://127.0.0.1:${ports.metrics}/metrics`, {
      signal: AbortSignal.timeout(5_000),
    }).catch(() => null);
    if (metrics === null || metrics.status !== 200) {
      problems.push(`${name}: metrics endpoint did not answer on its own port (OPS-63)`);
    } else {
      const text = await metrics.text();
      if (!text.includes('http_requests_total')) {
        problems.push(`${name}: metrics output lacks http_requests_total`);
      }
    }
    const stopped = await stopAndWait(child);
    if (!stopped.graceful || stopped.code !== 0) {
      problems.push(
        `${name}: SIGTERM did not produce a graceful exit 0 (OPS-62); got code=${stopped.code} graceful=${stopped.graceful}`,
      );
    }
    evidence.push(
      `${name}: healthz 200 (contract fields ok), readyz 503 with dead database, api/v1 404 envelope, metrics 200, SIGTERM exit ${stopped.code}`,
    );
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}

async function smokeWeb(port) {
  const distDir = join(ROOT, 'apps', 'web', 'dist');
  if (!existsSync(join(distDir, 'index.html'))) {
    problems.push('web: apps/web/dist/index.html is missing — run `bun run build` before the runtime check');
    return;
  }
  const env = {
    ...process.env,
    WEB_STATIC_DIR: distDir,
    WEB_HOST: '127.0.0.1',
    WEB_PORT: String(port),
    API_ORIGIN: 'http://127.0.0.1:1', // deliberately dead upstream: proves the 502 envelope path
    SERVE_PROXY_TIMEOUT_MS: '2000',
    BUILD_COMMIT: 'runtime-check',
  };
  const child = spawn(process.execPath, [join(ROOT, 'apps', 'web', 'server', 'serve.mjs')], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const root = await waitForHealth(`http://127.0.0.1:${port}/healthz`);
    if (root === null) {
      problems.push('web: /healthz never answered');
      return;
    }
    const index = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(5_000) }).catch(() => null);
    if (index === null || index.status !== 200 || !(index.headers.get('content-type') ?? '').includes('text/html')) {
      problems.push(`web: / did not serve the built bundle (status ${index?.status})`);
    }
    const unknown = await fetch(`http://127.0.0.1:${port}/_public/definitely-not-a-page`, {
      signal: AbortSignal.timeout(5_000),
    }).catch(() => null);
    if (unknown === null || unknown.status !== 200) {
      problems.push(`web: unknown client path must fall back to the SPA (UI-07), got ${unknown?.status}`);
    }
    // Encoded dot segments: clients normalize literal "../", so the attack shape that matters
    // is the percent-encoded one the server must decode and refuse.
    const traversal = await fetch(`http://127.0.0.1:${port}/%2e%2e/%2e%2e/%2e%2e/package.json`, {
      signal: AbortSignal.timeout(5_000),
      redirect: 'manual',
    }).catch(() => null);
    if (traversal !== null && traversal.status === 200) {
      const text = await traversal.text();
      if (text.includes('"workspaces"'))
        problems.push('web: path traversal served a file outside the static root (SECURITY DEFECT)');
    }
    const proxied = await fetch(`http://127.0.0.1:${port}/api/v1/anything`, {
      signal: AbortSignal.timeout(5_000),
    }).catch(() => null);
    if (proxied === null || proxied.status !== 502) {
      problems.push(`web: /api/* with a dead upstream must answer 502, got ${proxied?.status}`);
    } else {
      const envelope = await proxied.json();
      if (envelope.code !== 'bad_gateway' || typeof envelope.requestId !== 'string') {
        problems.push(`web: 502 body is not the error envelope: ${JSON.stringify(envelope).slice(0, 200)} (API-11)`);
      }
    }
    const stopped = await stopAndWait(child);
    if (!stopped.graceful || stopped.code !== 0) {
      problems.push(`web: SIGTERM did not produce a graceful exit 0; got code=${stopped.code}`);
    }
    evidence.push(
      `web: healthz 200, bundle served, SPA fallback, traversal rejected, dead-upstream 502 envelope, SIGTERM exit ${stopped.code}`,
    );
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}

if (!scanOnly && actualMajor === PINNED_NODE_MAJOR) {
  const missingArtefacts = [
    'apps/api/dist/main.js',
    'services/relation/dist/main.js',
    'services/sos/dist/main.js',
  ].filter((relative) => !existsSync(join(ROOT, relative)));
  if (missingArtefacts.length > 0) {
    problems.push(`built artefacts missing: ${missingArtefacts.join(', ')} — run \`bun run build\` first`);
  } else {
    evidence.push(`runtime: Node ${process.versions.node} (pinned major ${PINNED_NODE_MAJOR})`);
    await smokeBackend('api', join(ROOT, 'apps/api/dist/main.js'), { api: 39_301, metrics: 39_901 });
    await smokeBackend('relation', join(ROOT, 'services/relation/dist/main.js'), { api: 39_302, metrics: 39_902 });
    await smokeBackend('sos', join(ROOT, 'services/sos/dist/main.js'), { api: 39_303, metrics: 39_903 });
    await smokeWeb(39_310);
  }
}

if (problems.length > 0) {
  process.stderr.write('runtime compatibility check FAILED (QA-123):\n');
  for (const problem of problems) process.stderr.write(`  - ${problem}\n`);
  process.exit(1);
}
process.stdout.write(
  `runtime compatibility check passed (${scanOnly ? 'source scan only' : 'full smoke on the pinned runtime'}):\n`,
);
for (const line of evidence) process.stdout.write(`  · ${line}\n`);
