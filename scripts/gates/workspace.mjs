import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const rootManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const expectedWorkspaces = ['apps/*', 'services/*', 'packages/*'];
const workspacePaths = [
  'apps/api',
  'apps/web',
  'services/relation',
  'services/sos',
  'packages/config',
  'packages/contracts',
  'packages/logging',
  'packages/test-utils',
  'packages/validation',
];
const allowedDependencies = new Map([
  ['@boro/api', new Set(['@boro/config', '@boro/contracts', '@boro/logging', '@boro/validation'])],
  ['@boro/web', new Set()],
  ['@boro/relation-service', new Set(['@boro/config', '@boro/contracts', '@boro/logging'])],
  ['@boro/sos-service', new Set(['@boro/config', '@boro/contracts', '@boro/logging'])],
  ['@boro/config', new Set()],
  ['@boro/contracts', new Set()],
  ['@boro/logging', new Set(['@boro/contracts'])],
  ['@boro/test-utils', new Set(['@boro/contracts'])],
  ['@boro/validation', new Set(['@boro/contracts'])],
]);
const manifests = new Map();
const failures = [];

if (JSON.stringify(rootManifest.workspaces) !== JSON.stringify(expectedWorkspaces)) {
  failures.push('root workspaces must be exactly apps/*, services/*, packages/*');
}

for (const directory of workspacePaths) {
  const manifestPath = join(root, directory, 'package.json');
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (!manifest.name || manifests.has(manifest.name)) {
      failures.push(`${directory}/package.json: workspace package name is missing or duplicated`);
      continue;
    }
    manifests.set(manifest.name, { directory, manifest });
  } catch {
    failures.push(`${directory}/package.json: required workspace manifest is missing or invalid`);
  }
}

const dependencyGraph = new Map([...manifests.keys()].map((name) => [name, new Set()]));
for (const [name, workspace] of manifests) {
  const allowed = allowedDependencies.get(name) ?? new Set();
  const dependencies = {
    ...workspace.manifest.dependencies,
    ...workspace.manifest.devDependencies,
    ...workspace.manifest.optionalDependencies,
  };
  for (const dependency of Object.keys(dependencies)) {
    if (!manifests.has(dependency)) continue;
    if (!allowed.has(dependency)) {
      failures.push(
        `${workspace.directory}/package.json: forbidden workspace dependency ${name} -> ${dependency}`,
      );
      continue;
    }
    dependencyGraph.get(name)?.add(dependency);
  }
}

const visiting = new Set();
const visited = new Set();
function visit(name, chain = []) {
  if (visiting.has(name)) {
    failures.push(`workspace dependency cycle: ${[...chain, name].join(' -> ')}`);
    return;
  }
  if (visited.has(name)) return;
  visiting.add(name);
  for (const dependency of dependencyGraph.get(name) ?? []) visit(dependency, [...chain, name]);
  visiting.delete(name);
  visited.add(name);
}
for (const name of dependencyGraph.keys()) visit(name);

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    if (['node_modules', 'dist', 'coverage'].includes(entry)) continue;
    const path = join(directory, entry);
    const info = statSync(path);
    if (info.isDirectory()) files.push(...sourceFiles(path));
    else if (/\.(?:ts|tsx|vue)$/.test(entry) && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry))
      files.push(path);
  }
  return files;
}

function violatesSourceBoundary(workspaceDirectory, target) {
  if (workspaceDirectory === 'apps/web') return /^(?:apps\/api|services)\//.test(target);
  if (workspaceDirectory.startsWith('services/')) {
    return /^(?:apps|services)\//.test(target) && !target.startsWith(`${workspaceDirectory}/`);
  }
  if (workspaceDirectory.startsWith('packages/')) return /^(?:apps|services)\//.test(target);
  if (workspaceDirectory === 'apps/api') return /^(?:apps\/web|services)\//.test(target);
  return false;
}

for (const { directory } of manifests.values()) {
  for (const path of sourceFiles(join(root, directory))) {
    const text = readFileSync(path, 'utf8');
    const rel = relative(root, path).replaceAll('\\', '/');
    for (const match of text.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      let target;
      if (specifier?.startsWith('.')) {
        target = relative(root, resolve(dirname(path), specifier)).replaceAll('\\', '/');
      } else if (specifier?.startsWith('@boro/')) {
        const internal = manifests.get(specifier);
        if (!internal) {
          failures.push(`${rel}: unknown internal workspace import ${specifier}`);
          continue;
        }
        target = internal.directory;
      } else {
        continue;
      }
      if (target && violatesSourceBoundary(directory, target)) {
        failures.push(`${rel}: import crosses an application/service boundary to ${specifier}`);
      }
      if (directory === 'apps/web' && ['@boro/config', '@boro/logging'].includes(specifier ?? '')) {
        failures.push(`${rel}: frontend code must not import server configuration or logging`);
      }
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`[workspace] ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `workspace boundaries passed: ${workspacePaths.length} packages; acyclic allowed dependency graph; no app/service source boundary violations\n`,
  );
}
