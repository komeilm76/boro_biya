#!/usr/bin/env node
/**
 * The Phase 1 gate suite in one command (`bun run gate`) — the same entry point locally and in
 * CI (QA-58), running the full active set for Phase 1 (QA-77): documentation gate, traceability,
 * dependency direction, telemetry ban, licences, advisories, format, lint, strict typecheck,
 * unit tests, production builds, integration tests against disposable PostgreSQL 18, container
 * configuration assertions, runtime compatibility, and the baseline load profile.
 *
 * Every gate runs to completion; the summary table reports each exit status honestly (GOV-11)
 * and the process exits non-zero if any gate failed. No gate is ever silently skipped: a gate
 * that cannot run reports FAILED with the reason (fail closed, GOV-18).
 *
 * Flags: --only=id1,id2 (targeted runs; the summary says which gates were selected).
 * Dependency-free Node tooling (GOV-45).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function rootBin(relative) {
  const path = join(ROOT, 'node_modules', ...relative.split('/'));
  if (!existsSync(path)) throw new Error(`tool missing: ${relative} — run \`bun install\``);
  return path;
}

const PRETTIER = rootBin('prettier/bin/prettier.cjs');
const ESLINT = rootBin('eslint/bin/eslint.js');
const VITEST = rootBin('vitest/vitest.mjs');

/** Gates in run order. `needsBuild` gates run after the build gate has produced artefacts. */
const GATES = [
  { id: 'docs', name: 'Documentation gate (QA-01)', run: () => node([join(ROOT, 'scripts', 'gates', 'phase0.mjs')]) },
  {
    id: 'traceability',
    name: 'Traceability mapping (QA-01)',
    run: () => node([join(ROOT, 'scripts', 'gates', 'traceability.mjs')]),
  },
  {
    id: 'deps',
    name: 'Dependency direction (OPS-40, OPS-41)',
    run: () => node([join(ROOT, 'scripts', 'check-deps.mjs')]),
  },
  {
    id: 'telemetry',
    name: 'No analytics/telemetry dependency (PRIV-19)',
    run: () => node([join(ROOT, 'scripts', 'check-telemetry.mjs')]),
  },
  { id: 'licenses', name: 'Licence allowlist (QA-09)', run: () => node([join(ROOT, 'scripts', 'check-licenses.mjs')]) },
  {
    id: 'advisories',
    name: 'Vulnerability advisories (QA-09, SEC-63)',
    run: () => node([join(ROOT, 'scripts', 'check-advisories.mjs')]),
  },
  { id: 'format', name: 'Formatting (QA-02)', run: () => node([PRETTIER, '--check', '.']) },
  { id: 'lint', name: 'Static lint (QA-03)', run: () => node([ESLINT, '.']) },
  {
    id: 'typecheck',
    name: 'Strict typecheck (QA-04, GOV-56)',
    run: () => node([join(ROOT, 'scripts', 'typecheck.mjs')]),
  },
  { id: 'unit', name: 'Unit tests (QA-05, QA-66)', run: () => node([VITEST, 'run']) },
  { id: 'build', name: 'Production builds (QA-11)', run: () => node([join(ROOT, 'scripts', 'build.mjs')]) },
  {
    id: 'integration',
    name: 'Integration tests, disposable PostgreSQL 18 (QA-06, QA-15)',
    run: () => node([VITEST, 'run', '--config', join(ROOT, 'vitest.integration.config.ts')]),
  },
  {
    id: 'images',
    name: 'Container configuration assertions (QA-14)',
    run: () => node([join(ROOT, 'scripts', 'check-images.mjs')]),
  },
  {
    id: 'runtime',
    name: 'Runtime compatibility (QA-123, ADR-025)',
    run: () => node([join(ROOT, 'scripts', 'check-runtime.mjs')]),
  },
  {
    id: 'loadtest',
    name: 'Baseline load profile (QA-124, OPS-86)',
    run: () => node([join(ROOT, 'scripts', 'loadtest.mjs')]),
  },
];

function node(args) {
  const result = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
  return result.status ?? 1;
}

const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
const selected = onlyArg === undefined ? null : new Set(onlyArg.slice('--only='.length).split(','));
if (selected !== null) {
  // The build gate must run before gates that consume artefacts, even in a targeted run.
  for (const id of ['build']) if (!selected.has(id)) selected.add(id);
}

process.stdout.write(`gate suite: Node ${process.versions.node} on ${process.platform}\n`);
if (Number(process.versions.node.split('.')[0]) !== 24) {
  process.stdout.write(
    'note: this process is not the pinned production runtime (Node 24 LTS, ADR-025). Gates that require the\n' +
      'pinned runtime will report that honestly instead of passing; CI runs the full suite on Node 24.\n',
  );
}

const results = [];
for (const gate of GATES) {
  if (selected !== null && !selected.has(gate.id)) {
    results.push({ ...gate, status: 'not-selected', code: null, ms: 0 });
    continue;
  }
  const startedAt = Date.now();
  process.stdout.write(`\n=== ${gate.id}: ${gate.name} ===\n`);
  let code;
  try {
    code = gate.run();
  } catch (error) {
    process.stderr.write(`${gate.id} could not run: ${error.message}\n`);
    code = 1;
  }
  results.push({ ...gate, status: code === 0 ? 'PASS' : 'FAIL', code, ms: Date.now() - startedAt });
}

const failures = results.filter((entry) => entry.status === 'FAIL');
process.stdout.write('\n================ gate summary ================\n');
for (const entry of results) {
  const detail =
    entry.status === 'not-selected'
      ? 'not selected'
      : `${entry.status} (exit ${entry.code}, ${(entry.ms / 1_000).toFixed(1)}s)`;
  process.stdout.write(`  ${entry.id.padEnd(14)} ${entry.name.padEnd(62)} ${detail}\n`);
}
if (selected !== null) {
  process.stdout.write(
    'targeted run: gates marked "not selected" did not execute and are not claimed as passed (GOV-11).\n',
  );
}
if (failures.length > 0) {
  process.stderr.write(`\ngate suite FAILED: ${failures.map((entry) => entry.id).join(', ')}\n`);
  process.exit(1);
}
process.stdout.write('\ngate suite passed: every selected gate exited 0\n');
