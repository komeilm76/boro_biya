#!/usr/bin/env node
/**
 * Automated dependency-direction check (OPS-40, OPS-41) — the check the repository map promises
 * arrives with the packages in Phase 1. Dependency-free Node (GOV-45).
 *
 * Rules enforced:
 *  1. the workspace graph is acyclic (runtime, dev, and peer edges);
 *  2. nothing depends on an app or a service (apps are leaves);
 *  3. apps/web and browser-safe packages never take a runtime dependency on a server-only
 *     package (server code never reaches the frontend, OPS-41);
 *  4. the test-only package never appears in runtime dependencies (OPS-38: no production
 *     dependencies on test tooling);
 *  5. every declared workspace dependency actually exists in the workspace.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GROUPS = ['packages', 'apps', 'services'];

const workspaces = new Map();
for (const group of GROUPS) {
  const groupDir = join(ROOT, group);
  if (!existsSync(groupDir)) continue;
  for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(groupDir, entry.name, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    workspaces.set(manifest.name, {
      name: manifest.name,
      group,
      audience: manifest['x-audience'] ?? 'unspecified',
      dependencies: Object.keys(manifest.dependencies ?? {}),
      devDependencies: Object.keys(manifest.devDependencies ?? {}),
      peerDependencies: Object.keys(manifest.peerDependencies ?? {}),
    });
  }
}

const problems = [];
const notes = [];

// Rule 5 and edge collection.
const allEdges = new Map(); // name -> Set(all)
const runtimeEdges = new Map(); // name -> Set(runtime only)
for (const workspace of workspaces.values()) {
  const all = new Set();
  const runtime = new Set();
  for (const dep of [...workspace.dependencies, ...workspace.devDependencies, ...workspace.peerDependencies]) {
    if (!dep.startsWith('@boro-biya/')) continue;
    if (!workspaces.has(dep)) {
      problems.push(`${workspace.name} depends on ${dep}, which is not a workspace package`);
      continue;
    }
    all.add(dep);
    if (workspace.dependencies.includes(dep)) runtime.add(dep);
  }
  allEdges.set(workspace.name, all);
  runtimeEdges.set(workspace.name, runtime);
}

// Rule 1: acyclicity over all edges.
const state = new Map();
function visit(name, stack) {
  const status = state.get(name);
  if (status === 'done') return;
  if (status === 'visiting') {
    problems.push(`dependency cycle: ${[...stack, name].join(' -> ')}`);
    return;
  }
  state.set(name, 'visiting');
  for (const dep of allEdges.get(name) ?? []) visit(dep, [...stack, name]);
  state.set(name, 'done');
}
for (const name of workspaces.keys()) visit(name, []);

const audienceOf = (name) => workspaces.get(name)?.audience ?? 'unspecified';
const isBrowserContext = (name) => {
  const workspace = workspaces.get(name);
  if (workspace === undefined) return false;
  return workspace.name === '@boro-biya/web' || workspace.audience === 'browser-safe';
};

for (const workspace of workspaces.values()) {
  for (const dep of allEdges.get(workspace.name) ?? []) {
    const depWorkspace = workspaces.get(dep);
    // Rule 2: apps and services are leaves.
    if (depWorkspace !== undefined && (depWorkspace.group === 'apps' || depWorkspace.group === 'services')) {
      problems.push(`${workspace.name} depends on ${dep}, but apps and services are leaves (OPS-40)`);
    }
  }
  for (const dep of runtimeEdges.get(workspace.name) ?? []) {
    // Rule 3: browser contexts take runtime dependencies on browser-safe packages only.
    if (isBrowserContext(workspace.name) && audienceOf(dep) === 'server') {
      problems.push(`${workspace.name} (browser-facing) has a runtime dependency on ${dep} (server-only) — OPS-41`);
    }
    // Rule 4: test tooling never reaches production dependency sets.
    if (audienceOf(dep) === 'test') {
      problems.push(
        `${workspace.name} lists ${dep} in runtime dependencies; test tooling belongs in devDependencies (OPS-38)`,
      );
    }
  }
}

notes.push(`workspaces: ${workspaces.size}`);
for (const workspace of workspaces.values()) {
  notes.push(
    `  ${workspace.name} [${workspace.group}, ${workspace.audience}] -> ${[...(runtimeEdges.get(workspace.name) ?? [])].join(', ') || '(no workspace runtime deps)'}`,
  );
}

if (problems.length > 0) {
  process.stderr.write('dependency-direction check FAILED:\n');
  for (const problem of problems) process.stderr.write(`  - ${problem}\n`);
  process.exit(1);
}
process.stdout.write('dependency-direction check passed (OPS-40, OPS-41):\n');
for (const note of notes) process.stdout.write(`${note}\n`);
