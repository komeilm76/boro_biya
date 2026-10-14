#!/usr/bin/env node
/**
 * Dependency vulnerability audit (QA-09, SEC-63): queries the npm registry's bulk advisory
 * endpoint — the same data source `npm audit` uses — for every installed package version, so the
 * check works with the Bun lockfile and stays dependency-free (GOV-45).
 *
 * Gate rule: any critical or high advisory fails the build (SEC-63: fixes are prioritized by
 * severity; the release rule is no unresolved critical vulnerabilities). Moderate and low
 * findings are printed for the review record. When the registry is unreachable the gate FAILS
 * (fail closed, GOV-18): an audit that cannot run is not an audit that passed.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BULK_ENDPOINT = 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk';
const FAILING_SEVERITIES = new Set(['critical', 'high']);

function collectInstalled() {
  const found = new Map(); // name -> Set(versions)
  const visit = (dir) => {
    if (!existsSync(dir)) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === '.bin' || entry.name === '.cache') continue;
      const full = join(dir, entry.name);
      if (entry.name.startsWith('@') && !entry.name.includes('+')) {
        visit(full);
        continue;
      }
      const manifestPath = join(full, 'package.json');
      try {
        if (!statSync(full).isDirectory()) continue;
      } catch {
        continue;
      }
      if (!existsSync(manifestPath)) {
        visit(join(full, 'node_modules'));
        continue;
      }
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') continue;
        if (manifest.name.startsWith('@boro-biya/') || manifest.name === 'boro-biya') continue;
        const versions = found.get(manifest.name) ?? new Set();
        versions.add(manifest.version);
        found.set(manifest.name, versions);
      } catch {
        continue;
      }
    }
  };
  visit(join(ROOT, 'node_modules'));
  visit(join(ROOT, 'node_modules', '.bun'));
  for (const group of ['packages', 'apps', 'services']) {
    const groupDir = join(ROOT, group);
    if (!existsSync(groupDir)) continue;
    for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
      if (entry.isDirectory()) visit(join(groupDir, entry.name, 'node_modules'));
    }
  }
  return found;
}

const installed = collectInstalled();
if (installed.size === 0) {
  process.stderr.write('advisory check FAILED: no installed packages found — run `bun install` first.\n');
  process.exit(1);
}

const names = [...installed.keys()].sort();
process.stdout.write(
  `advisory check: querying ${names.length} packages (${[...installed.values()].reduce((n, s) => n + s.size, 0)} installed versions)\n`,
);

const failing = [];
const noted = [];
let queried = 0;

// Chunked so one request never carries the whole tree.
const CHUNK = 40;
for (let index = 0; index < names.length; index += CHUNK) {
  const chunk = names.slice(index, index + CHUNK);
  const body = {};
  for (const name of chunk) body[name] = [...installed.get(name)];
  let response;
  try {
    response = await fetch(BULK_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    process.stderr.write(
      `advisory check FAILED: registry unreachable (${error.message}); the gate fails closed (GOV-18).\n`,
    );
    process.exit(1);
  }
  if (!response.ok) {
    process.stderr.write(`advisory check FAILED: registry responded ${response.status}; the gate fails closed.\n`);
    process.exit(1);
  }
  const data = await response.json();
  queried += chunk.length;
  for (const [name, advisories] of Object.entries(data)) {
    if (!Array.isArray(advisories)) continue;
    for (const advisory of advisories) {
      const severity = String(advisory.severity ?? 'unknown').toLowerCase();
      const line = `${name} (${[...installed.get(name)].join(', ')}): ${severity} — ${advisory.title ?? advisory.id} [${advisory.url ?? 'no url'}] range: ${advisory.vulnerable_versions ?? advisory.range ?? '?'}`;
      if (FAILING_SEVERITIES.has(severity)) failing.push(line);
      else noted.push(line);
    }
  }
}

for (const note of noted) process.stdout.write(`  review: ${note}\n`);
process.stdout.write(`advisory check: ${queried} packages queried\n`);
if (failing.length > 0) {
  process.stderr.write('advisory check FAILED (critical/high findings must be fixed before merge, SEC-63):\n');
  for (const item of failing) process.stderr.write(`  - ${item}\n`);
  process.exit(1);
}
process.stdout.write(
  `advisory check passed: no critical or high advisories${noted.length > 0 ? ` (${noted.length} lower-severity finding(s) printed for review)` : ''}\n`,
);
