#!/usr/bin/env node
/**
 * Build every workspace artefact (QA-11) with Node, the pinned baseline runtime (ADR-007,
 * ADR-025: Bun orchestrates and installs; compiled artefacts build and run on Node 24 LTS).
 *
 * Order is computed from the workspace dependency graph — never hardcoded — and the graph is
 * asserted acyclic before anything runs (OPS-40). Dependency-free (GOV-45), identical on
 * Windows and Linux (OPS-65).
 *
 * Usage:
 *   node scripts/build.mjs                      # everything
 *   node scripts/build.mjs --filter=@boro-biya/web   # one workspace and its workspace deps
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GROUPS = ['packages', 'apps', 'services'];

function collectWorkspaces() {
  const workspaces = new Map();
  for (const group of GROUPS) {
    const groupDir = join(ROOT, group);
    if (!existsSync(groupDir)) continue;
    for (const entry of readdir(groupDir)) {
      const dir = join(groupDir, entry);
      const manifestPath = join(dir, 'package.json');
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      workspaces.set(manifest.name, { name: manifest.name, dir, manifest });
    }
  }
  return workspaces;
}

function readdir(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function workspaceDependencies(manifest, known) {
  const deps = new Set();
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const entries = manifest[section] ?? {};
    for (const name of Object.keys(entries)) {
      if (known.has(name)) deps.add(name);
    }
  }
  return deps;
}

function topoSort(workspaces) {
  const order = [];
  const state = new Map(); // name -> 'visiting' | 'done'
  const visit = (name, stack) => {
    const status = state.get(name);
    if (status === 'done') return;
    if (status === 'visiting') {
      throw new Error(`dependency cycle detected: ${[...stack, name].join(' -> ')} (OPS-40)`);
    }
    state.set(name, 'visiting');
    const workspace = workspaces.get(name);
    for (const dep of workspaceDependencies(workspace.manifest, workspaces)) {
      visit(dep, [...stack, name]);
    }
    state.set(name, 'done');
    order.push(name);
  };
  for (const name of workspaces.keys()) visit(name, []);
  return order;
}

function filterClosure(workspaces, filter) {
  const wanted = new Set();
  const add = (name) => {
    if (wanted.has(name)) return;
    if (!workspaces.has(name)) throw new Error(`unknown workspace "${name}"`);
    wanted.add(name);
    for (const dep of workspaceDependencies(workspaces.get(name).manifest, workspaces)) add(dep);
  };
  add(filter);
  return wanted;
}

function resolveBin(name, binRelative, workspaceDir) {
  const local = join(workspaceDir, 'node_modules', ...binRelative.split('/'));
  if (existsSync(local)) return local;
  const root = join(ROOT, 'node_modules', ...binRelative.split('/'));
  if (existsSync(root)) return root;
  throw new Error(`cannot resolve ${name} (${binRelative}) from ${workspaceDir} or the workspace root`);
}

function buildWorkspace(workspace) {
  const { name, dir } = workspace;
  if (name === '@boro-biya/web') {
    const vite = resolveBin('vite', 'vite/bin/vite.js', dir);
    return run('vite build', [vite, 'build'], dir);
  }
  if (name === '@boro-biya/android') {
    return { ok: true, skipped: 'packaging config only; the native build arrives in Phase 8' };
  }
  const buildTsconfig = join(dir, 'tsconfig.build.json');
  if (existsSync(buildTsconfig)) {
    const tsc = resolveBin('tsc', 'typescript/bin/tsc', dir);
    return run('tsc -p tsconfig.build.json', [tsc, '-p', buildTsconfig], dir);
  }
  return { ok: true, skipped: 'no build step' };
}

function run(label, args, cwd) {
  const result = spawnSync(process.execPath, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.status !== 0) return { ok: false, label };
  return { ok: true, label };
}

const workspaces = collectWorkspaces();
const order = topoSort(workspaces);
const filterArg = process.argv.find((arg) => arg.startsWith('--filter='));
const selected =
  filterArg === undefined ? new Set(order) : filterClosure(workspaces, filterArg.slice('--filter='.length));

let failures = 0;
for (const name of order) {
  if (!selected.has(name)) continue;
  const outcome = buildWorkspace(workspaces.get(name));
  if (outcome.skipped !== undefined) {
    process.stdout.write(`· ${name}: skipped (${outcome.skipped})\n`);
  } else if (outcome.ok) {
    process.stdout.write(`✓ ${name}: built\n`);
  } else {
    failures += 1;
    process.stderr.write(`✗ ${name}: build failed\n`);
  }
}

if (failures > 0) {
  process.stderr.write(`build failed: ${failures} workspace(s)\n`);
  process.exit(1);
}
process.stdout.write('build complete\n');
