#!/usr/bin/env node
/**
 * Baseline load profile runner (ADR-028, OPS-86, QA-124).
 *
 * Runs the documented Phase 1 profile — bounded synthetic concurrency against the core API's
 * operational endpoints, with the database reachable — on a disposable PostgreSQL 18, measures
 * latency percentiles, error rate, throughput, process memory, and log volume, and FAILS on a
 * breach of the pass/fail criteria in scripts/loadtest/baseline.json (mirrored in
 * docs/performance/README.md). Every report records the hardware and workload assumptions
 * behind it (OPS-86); numbers are never compared across different hardware (QA-108), and no
 * production capacity claim is derived from this run (ADR-028, GOV-91).
 *
 * Dependency-free Node (GOV-45); uses the built artefacts (run `bun run build` first — the gate
 * orchestrator does). Flags: --concurrency=N --duration=N --report=path.json
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, totalmem, platform, arch } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = join(ROOT, 'scripts', 'loadtest', 'baseline.json');

const argv = process.argv.slice(2);
const flagNumber = (name) => {
  const hit = argv.find((arg) => arg.startsWith(`--${name}=`));
  return hit === undefined ? undefined : Number(hit.slice(name.length + 3));
};
const reportFlag = argv.find((arg) => arg.startsWith('--report='));
const reportPath = reportFlag === undefined ? undefined : reportFlag.slice('--report='.length);
// --baseline=<file> substitutes the pass/fail rule. Its purpose is proving the gate FAILS on a
// breach (QA-124): CI and the gate suite use the committed baseline; a reviewer can point this
// at a tightened copy and watch the run fail closed.
const baselineFlag = argv.find((arg) => arg.startsWith('--baseline='));
const baselinePath = baselineFlag === undefined ? BASELINE_PATH : baselineFlag.slice('--baseline='.length);

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const concurrency = flagNumber('concurrency') ?? baseline.profile.concurrency;
const durationSeconds = flagNumber('duration') ?? baseline.profile.durationSeconds;
const warmupSeconds = baseline.profile.warmupSeconds;
const mix = baseline.profile.mix;
const requestTimeoutMs = baseline.profile.requestTimeoutMs;

const requiredArtefacts = [
  'apps/api/dist/main.js',
  'packages/test-utils/dist/pg/index.js',
  'packages/db/dist/index.js',
];
const missing = requiredArtefacts.filter((relative) => !existsSync(join(ROOT, relative)));
if (missing.length > 0) {
  process.stderr.write(`loadtest: missing built artefacts: ${missing.join(', ')} — run \`bun run build\` first.\n`);
  process.exit(1);
}

const API_PORT = 39_401;
const METRICS_PORT = 39_911;
const BASE = `http://127.0.0.1:${API_PORT}`;
const PASSWORDS = {
  core: 'disposable-loadtest-only',
  relation: 'disposable-loadtest-only',
  sos: 'disposable-loadtest-only',
};

const { startTestDatabaseServer } = await import(
  pathToFileURL(join(ROOT, 'packages/test-utils/dist/pg/index.js')).href
);
const { initCluster, serviceConnectionString, CLUSTER_SERVICES } = await import(
  pathToFileURL(join(ROOT, 'packages/db/dist/index.js')).href
);

process.stdout.write('loadtest: starting disposable PostgreSQL 18...\n');
const dbServer = await startTestDatabaseServer();
const pgVersion = await dbServer.serverVersion();
const database = await dbServer.createDatabase('loadtest');
await initCluster({
  adminConnectionString: database.adminConnectionString,
  passwords: PASSWORDS,
  repoRoot: ROOT,
  log: () => undefined,
});
const coreService = CLUSTER_SERVICES.find((entry) => entry.key === 'core');
if (coreService === undefined) throw new Error('cluster map lost the core service');
const coreUrl = serviceConnectionString(database.adminConnectionString, coreService, PASSWORDS.core);

process.stdout.write('loadtest: starting the core API artefact...\n');
const apiLogs = [];
const api = spawn(process.execPath, [join(ROOT, 'apps/api/dist/main.js')], {
  cwd: ROOT,
  env: {
    ...process.env,
    NODE_ENV: 'test',
    SERVICE_NAME: 'api',
    API_HOST: '127.0.0.1',
    API_PORT: String(API_PORT),
    METRICS_HOST: '127.0.0.1',
    METRICS_PORT: String(METRICS_PORT),
    LOG_LEVEL: 'info',
    DATABASE_URL: coreUrl,
    WEB_ORIGIN: 'http://localhost:5173',
    GRACEFUL_SHUTDOWN_TIMEOUT_SECONDS: '5',
    BUILD_COMMIT: 'loadtest',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
api.stdout.setEncoding('utf8');
api.stdout.on('data', (chunk) => apiLogs.push(chunk));
api.stderr.setEncoding('utf8');
api.stderr.on('data', (chunk) => apiLogs.push(chunk));

const cleanup = async (code) => {
  try {
    if (api.exitCode === null) {
      api.kill('SIGTERM');
      await new Promise((wait) => setTimeout(wait, 1_500));
      if (api.exitCode === null) api.kill('SIGKILL');
    }
  } catch {
    /* best effort */
  }
  try {
    await database.drop();
  } catch {
    /* best effort */
  }
  try {
    await dbServer.stop();
  } catch {
    /* best effort */
  }
  process.exit(code);
};
process.on('SIGINT', () => {
  void cleanup(130);
});

async function waitHealthy(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const health = await fetch(`${BASE}/healthz`, { signal: AbortSignal.timeout(1_000) });
      const ready = await fetch(`${BASE}/readyz`, { signal: AbortSignal.timeout(3_000) });
      if (health.ok && ready.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((wait) => setTimeout(wait, 250));
  }
  return false;
}

if (!(await waitHealthy())) {
  process.stderr.write(`loadtest: the API never became healthy. Output:\n${apiLogs.join('').slice(-2_000)}\n`);
  await cleanup(1);
}

async function scrapeRssBytes() {
  try {
    const response = await fetch(`http://127.0.0.1:${METRICS_PORT}/metrics`, { signal: AbortSignal.timeout(2_000) });
    const text = await response.text();
    const match = /^process_resident_memory_bytes\{[^}]*\}\s+(\d+(?:\.\d+)?(?:e[+-]?\d+)?)/m.exec(text);
    return match === null ? null : Number(match[1]);
  } catch {
    return null;
  }
}

// Idle footprint before load (OPS-51: idle footprint is measured, not guessed).
await new Promise((wait) => setTimeout(wait, 2_000));
const idleRssBytes = await scrapeRssBytes();

// Phase 1 scope assertion: the stream surface must not exist yet (SSE ships in Phase 4).
const streamProbe = await fetch(`${BASE}/api/v1/streams`, { signal: AbortSignal.timeout(5_000) }).catch(() => null);
const streamSurfaceAbsent = streamProbe !== null && streamProbe.status === 404;

function pickPath() {
  const roll = Math.random();
  let cumulative = 0;
  for (const [path, weight] of Object.entries(mix)) {
    cumulative += weight;
    if (roll <= cumulative) return path;
  }
  return Object.keys(mix)[0] ?? '/healthz';
}

process.stdout.write(
  `loadtest: warmup ${warmupSeconds}s, then ${concurrency} concurrent clients for ${durationSeconds}s (mix ${JSON.stringify(mix)})\n`,
);

async function runPhase(seconds, record) {
  const latencies = [];
  let ok = 0;
  let failed = 0;
  const statusCounts = new Map();
  const stopAt = Date.now() + seconds * 1_000;
  const rssSamples = [];
  const sampler = setInterval(() => {
    void scrapeRssBytes().then((value) => {
      if (value !== null) rssSamples.push(value);
    });
  }, 2_000);
  const worker = async () => {
    while (Date.now() < stopAt) {
      const path = pickPath();
      const startedAt = performance.now();
      try {
        const response = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(requestTimeoutMs) });
        await response.body?.cancel();
        const latency = performance.now() - startedAt;
        statusCounts.set(response.status, (statusCounts.get(response.status) ?? 0) + 1);
        if (response.ok) ok += 1;
        else failed += 1;
        if (record) latencies.push(latency);
      } catch {
        failed += 1;
        if (record) latencies.push(performance.now() - startedAt);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  clearInterval(sampler);
  // Final scrape after the sampler may have missed the peak window.
  const finalRss = await scrapeRssBytes();
  if (finalRss !== null) rssSamples.push(finalRss);
  return { latencies, ok, failed, statusCounts, rssSamples, total: ok + failed };
}

await runPhase(warmupSeconds, false);
const startedAt = performance.now();
const result = await runPhase(durationSeconds, true);
const elapsedSeconds = (performance.now() - startedAt) / 1_000;

const sorted = [...result.latencies].sort((a, b) => a - b);
const percentile = (fraction) => {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? Number.NaN;
};
const rps = result.total / Math.max(elapsedSeconds, 0.001);
const errorRate = result.total === 0 ? 1 : result.failed / result.total;
const logBytes = Buffer.byteLength(apiLogs.join(''));
const logBytesPer1k = result.total === 0 ? Number.POSITIVE_INFINITY : (logBytes / result.total) * 1_000;
const peakRssBytes = result.rssSamples.length > 0 ? Math.max(...result.rssSamples) : (idleRssBytes ?? 0);
const MB = 1024 * 1024;

const report = {
  generatedAt: new Date().toISOString(),
  phase: 1,
  gate: 'QA-124 baseline profile',
  environment: {
    platform: platform(),
    arch: arch(),
    nodeVersion: process.versions.node,
    cpuModel: cpus()[0]?.model ?? 'unknown',
    cpuCount: cpus().length,
    totalMemoryMb: Math.round(totalmem() / MB),
    postgresVersion: pgVersion,
    reference: 'the machine that produced this report (never compare across hardware, QA-108)',
  },
  workload: {
    concurrency,
    warmupSeconds,
    durationSeconds: Math.round(elapsedSeconds * 10) / 10,
    mix,
    targetService: 'api (core API artefact, built dist)',
    routes: Object.keys(mix),
  },
  results: {
    requests: result.total,
    requestsPerSecond: Math.round(rps * 10) / 10,
    errorRate: Math.round(errorRate * 100_000) / 100_000,
    statusCounts: Object.fromEntries(result.statusCounts),
    latencyMs: {
      p50: Math.round(percentile(0.5) * 10) / 10,
      p95: Math.round(percentile(0.95) * 10) / 10,
      p99: Math.round(percentile(0.99) * 10) / 10,
      max: Math.round((sorted.at(-1) ?? Number.NaN) * 10) / 10,
    },
    memoryMb: {
      idleRss: idleRssBytes === null ? null : Math.round((idleRssBytes / MB) * 10) / 10,
      peakRss: Math.round((peakRssBytes / MB) * 10) / 10,
    },
    logBytesPer1kRequests: Math.round(logBytesPer1k),
    streamSurfaceAbsent,
  },
  pass: baseline.pass,
  breaches: [],
};

const checks = [
  [
    'p95 latency',
    report.results.latencyMs.p95 <= baseline.pass.p95MsMax,
    `p95 ${report.results.latencyMs.p95} ms <= ${baseline.pass.p95MsMax} ms`,
  ],
  [
    'p99 latency',
    report.results.latencyMs.p99 <= baseline.pass.p99MsMax,
    `p99 ${report.results.latencyMs.p99} ms <= ${baseline.pass.p99MsMax} ms`,
  ],
  [
    'error rate',
    report.results.errorRate <= baseline.pass.errorRateMax,
    `errors ${(report.results.errorRate * 100).toFixed(3)}% <= ${(baseline.pass.errorRateMax * 100).toFixed(3)}%`,
  ],
  [
    'throughput floor',
    report.results.requestsPerSecond >= baseline.pass.requestsPerSecondMin,
    `${report.results.requestsPerSecond} rps >= ${baseline.pass.requestsPerSecondMin} rps`,
  ],
  [
    'idle memory',
    idleRssBytes === null || idleRssBytes / MB <= baseline.pass.idleRssMbMax,
    `idle RSS ${report.results.memoryMb.idleRss} MB <= ${baseline.pass.idleRssMbMax} MB`,
  ],
  [
    'peak memory',
    peakRssBytes / MB <= baseline.pass.peakRssMbMax,
    `peak RSS ${report.results.memoryMb.peakRss} MB <= ${baseline.pass.peakRssMbMax} MB`,
  ],
  [
    'log volume',
    logBytesPer1k <= baseline.pass.logBytesPer1kRequestsMax,
    `${Math.round(logBytesPer1k)} B/1k requests <= ${baseline.pass.logBytesPer1kRequestsMax} B/1k`,
  ],
  ['stream surface absent (Phase 4 owns SSE)', streamSurfaceAbsent, 'GET /api/v1/streams answers 404'],
];
for (const [name, passed, detail] of checks) {
  process.stdout.write(`  ${passed ? '✓' : '✗'} ${name}: ${detail}\n`);
  if (!passed) report.breaches.push(`${name}: ${detail}`);
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (reportPath !== undefined) {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`report written to ${reportPath}\n`);
}

if (report.breaches.length > 0) {
  process.stderr.write(
    `loadtest FAILED: ${report.breaches.length} breach(es) of the baseline pass/fail rule (QA-124)\n`,
  );
  await cleanup(1);
}
process.stdout.write('loadtest PASSED: baseline profile within the pass/fail rule\n');
await cleanup(0);
