#!/usr/bin/env node
/**
 * Licence allowlist check (QA-09, dependency policy §6): every installed third-party package is
 * classified against the allowlist. Anything outside it fails the gate — a package needing
 * written owner approval must not slip through CI. Dependency-free Node (GOV-45); reads the
 * installed tree, so it checks what actually runs, not what a manifest hopes for.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ALLOWED = new Set([
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'CC0-1.0',
  'Unlicense',
  'Python-2.0',
  'PostgreSQL', // the PostgreSQL licence of the embedded server binaries (MIT-style permissive)
  // Blue Oak Model License 1.0.0: permissive, MIT-compatible in intent, published by the npm
  // ecosystem's own tooling authors. It reaches this tree only through dev-only transitives of
  // @capacitor/cli (tar, yallist, sax). Recorded in the dependency policy §6 allowlist.
  'BlueOak-1.0.0',
]);
// Allowed with the documented note (dependency policy §6): source-available copyleft and
// documentation/font licences. They pass, and the gate prints why they were noticed.
const ALLOWED_WITH_NOTE = new Map([
  ['MPL-2.0', 'file-level copyleft; permitted without further review (policy §6)'],
  ['CC-BY-4.0', 'documentation/data licence; permitted without further review (policy §6)'],
  ['CC-BY-3.0', 'documentation/data licence; permitted without further review (policy §6)'],
  ['OFL-1.1', 'font licence; permitted without further review (policy §6)'],
]);

function collectPackageDirs() {
  const found = new Map(); // "name@version" -> manifest
  const visitNodeModules = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.name.startsWith('@') && entry.isDirectory() && !entry.name.includes('+')) {
        visitNodeModules(full);
        continue;
      }
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const manifestPath = join(full, 'package.json');
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue; // dangling symlink
      }
      if (!stat.isDirectory()) continue;
      if (!existsSync(manifestPath)) {
        // bun isolated store: <store>/name@version/node_modules/<real packages>
        const nested = join(full, 'node_modules');
        if (existsSync(nested)) visitNodeModules(nested);
        continue;
      }
      let manifest;
      try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      } catch {
        continue;
      }
      if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') continue;
      found.set(`${manifest.name}@${manifest.version}`, manifest);
    }
  };
  visitNodeModules(join(ROOT, 'node_modules'));
  // The bun isolated store keeps the real directories here; visiting it catches transitive
  // packages that are not linked into any visible node_modules top level.
  visitNodeModules(join(ROOT, 'node_modules', '.bun'));
  for (const group of ['packages', 'apps', 'services']) {
    const groupDir = join(ROOT, group);
    if (!existsSync(groupDir)) continue;
    for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
      if (entry.isDirectory()) visitNodeModules(join(groupDir, entry.name, 'node_modules'));
    }
  }
  return found;
}

function classify(licenseField) {
  // Old npm manifests carry { "type": "MIT", "url": ... } objects instead of SPDX strings.
  let field = licenseField;
  if (typeof field === 'object' && field !== null && typeof field.type === 'string') field = field.type;
  if (typeof field !== 'string' || field.trim() === '') return { verdict: 'unknown', parts: [] };
  const expression = field.trim();
  // Split simple OR/AND expressions; every part must be allowed.
  const parts = expression
    .replace(/[()]/g, ' ')
    .split(/\s+(?:OR|AND)\s+/i)
    .map((part) => part.trim())
    .filter((part) => part !== '');
  const verdicts = parts.map((part) => {
    if (ALLOWED.has(part)) return 'allowed';
    if (ALLOWED_WITH_NOTE.has(part)) return 'noted';
    return 'violation';
  });
  if (verdicts.includes('violation')) return { verdict: 'violation', parts };
  if (verdicts.includes('unknown')) return { verdict: 'unknown', parts };
  if (verdicts.includes('noted')) return { verdict: 'noted', parts };
  return { verdict: 'allowed', parts };
}

const packages = collectPackageDirs();
const violations = [];
const noted = [];
const counts = new Map();
let checked = 0;

for (const [id, manifest] of packages) {
  if (manifest.name.startsWith('@boro-biya/')) continue; // first-party
  if (manifest.private === true && manifest.name === 'boro-biya') continue;
  checked += 1;
  const { verdict, parts } = classify(manifest.license);
  counts.set(verdict, (counts.get(verdict) ?? 0) + 1);
  if (verdict === 'violation' || verdict === 'unknown') {
    violations.push(`${id}: licence "${manifest.license ?? 'missing'}" is outside the allowlist (policy §6)`);
  } else if (verdict === 'noted') {
    noted.push(`${id}: ${parts.map((part) => `${part} — ${ALLOWED_WITH_NOTE.get(part)}`).join('; ')}`);
  }
}

process.stdout.write(`licence check: ${checked} third-party packages classified\n`);
for (const note of noted) process.stdout.write(`  note: ${note}\n`);
if (violations.length > 0) {
  process.stderr.write('licence check FAILED:\n');
  for (const violation of violations) process.stderr.write(`  - ${violation}\n`);
  process.stderr.write(
    'Packages outside the allowlist need written owner approval (policy §6) — they do not pass CI.\n',
  );
  process.exit(1);
}
process.stdout.write('licence check passed: every installed package is inside the allowlist\n');
