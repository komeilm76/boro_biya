import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const failures = [];
const allowedLicences = new Set([
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'CC0-1.0',
  'Unlicense',
  'Python-2.0',
]);
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const rootManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const workspaceDirectories = ['.'];

for (const pattern of rootManifest.workspaces ?? []) {
  const [base, wildcard] = pattern.split('/');
  if (wildcard !== '*') {
    workspaceDirectories.push(pattern);
    continue;
  }
  const basePath = join(root, base);
  if (!existsSync(basePath)) continue;
  for (const entry of readdirSync(basePath)) {
    if (statSync(join(basePath, entry)).isDirectory()) workspaceDirectories.push(join(base, entry));
  }
}

const workspacePackages = new Map();
const manifests = workspaceDirectories.map((directory) => {
  const path = join(root, directory, 'package.json');
  if (!existsSync(path)) {
    failures.push(`missing workspace manifest: ${directory}/package.json`);
    return { directory, path, data: {} };
  }
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (data.name) workspacePackages.set(data.name, { version: data.version, directory });
  return { directory, path, data };
});

function findInstalledManifest(requireFromWorkspace, workspacePath, name) {
  try {
    const resolved = requireFromWorkspace.resolve(`${name}/package.json`);
    if (existsSync(resolved)) return resolved;
  } catch {
    // Some packages do not export their manifest; fall back to the resolved entry point.
  }

  try {
    let current = dirname(requireFromWorkspace.resolve(name));
    while (current !== dirname(current)) {
      const candidate = join(current, 'package.json');
      if (existsSync(candidate)) {
        const metadata = JSON.parse(readFileSync(candidate, 'utf8'));
        if (metadata.name === name) return candidate;
      }
      current = dirname(current);
    }
  } catch {
    // Type-only packages may have no JavaScript entry point; resolve them from node_modules below.
  }

  let current = dirname(workspacePath);
  while (current !== dirname(current)) {
    const candidate = join(current, 'node_modules', ...name.split('/'), 'package.json');
    if (existsSync(candidate)) return candidate;
    current = dirname(current);
  }
  return undefined;
}

let directReferences = 0;
const installedNames = new Set();
for (const manifest of manifests) {
  const requireFromWorkspace = createRequire(manifest.path);
  const sections = ['dependencies', 'devDependencies', 'optionalDependencies'];
  for (const section of sections) {
    const dependencies = manifest.data[section] ?? {};
    for (const [name, version] of Object.entries(dependencies)) {
      directReferences += 1;
      if (typeof version !== 'string' || !exactVersion.test(version)) {
        failures.push(
          `${manifest.directory}/package.json: ${name} must use an exact version, found ${String(version)}`,
        );
        continue;
      }

      const local = workspacePackages.get(name);
      if (local) {
        if (version !== local.version) {
          failures.push(
            `${manifest.directory}/package.json: ${name} pins ${version}, workspace is ${local.version}`,
          );
        }
        installedNames.add(name);
        continue;
      }

      const installedPath = findInstalledManifest(requireFromWorkspace, manifest.path, name);
      if (!installedPath) {
        failures.push(
          `${manifest.directory}/package.json: ${name}@${version} is not installed from this workspace`,
        );
        continue;
      }
      const installed = JSON.parse(readFileSync(installedPath, 'utf8'));
      installedNames.add(name);
      if (installed.version !== version) {
        failures.push(
          `${manifest.directory}/package.json: ${name} resolves to ${installed.version}, expected ${version}`,
        );
      }
      const licence = typeof installed.license === 'string' ? installed.license : '';
      if (!allowedLicences.has(licence)) {
        failures.push(
          `${manifest.directory}/package.json: ${name}@${version} has unapproved or missing licence ${licence || '(missing)'}`,
        );
      }
    }
  }
}

if (manifests.length !== 10)
  failures.push(`expected 10 workspace manifests, found ${manifests.length}`);
if (!existsSync(join(root, 'bun.lock'))) failures.push('bun.lock is missing');

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`[deps] ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `dependency policy passed: ${manifests.length} manifests, ${directReferences} direct references, ${installedNames.size} installed packages; exact pins and allowed licences\n`,
  );
}
