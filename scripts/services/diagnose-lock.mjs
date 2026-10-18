// Failure-only, offline diagnostics. Never changes the original checkout or weakens an assertion.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const read = (path) => JSON.parse(readFileSync(path, 'utf8').replace(/,(\s*[}\]])/g, '$1'));
export function diagnoseLocks(output, repositoryRoot, environment) {
  const results = {};
  const check = (name, cwd) => {
    try {
      execFileSync('bun', ['install', '--lockfile-only', '--frozen-lockfile', '--ignore-scripts', '--offline'], {
        cwd,
        env: {
          ...environment,
          PWD: cwd,
          INIT_CWD: cwd,
          BUN_INSTALL_CACHE_DIR: join(output, `diagnostic-cache-${name}`),
        },
        stdio: 'pipe',
        timeout: 15_000,
        windowsHide: true,
      });
      results[name] = 'pass';
    } catch {
      results[name] = 'fail';
    }
  };
  check('repository-baseline', repositoryRoot);
  for (const name of ['sorted', 'explicit-root', 'config-v0', 'lock-v1', 'single-root']) {
    const target = `${output}-diagnostic-${name}`;
    mkdirSync(target);
    cpSync(join(output, 'packages'), join(target, 'packages'), { recursive: true });
    cpSync(join(output, 'services'), join(target, 'services'), { recursive: true });
    const manifest = read(join(output, 'package.json'));
    const lock = read(join(output, 'bun.lock'));
    if (name === 'sorted') {
      lock.workspaces = Object.fromEntries(Object.entries(lock.workspaces).sort(([a], [b]) => a.localeCompare(b)));
      for (const workspace of Object.values(lock.workspaces))
        for (const key of ['dependencies', 'devDependencies', 'peerDependencies']) {
          if (workspace[key])
            workspace[key] = Object.fromEntries(Object.entries(workspace[key]).sort(([a], [b]) => a.localeCompare(b)));
        }
      manifest.devDependencies = lock.workspaces[''].devDependencies;
    }
    if (name === 'explicit-root') {
      const service = Object.values(lock.workspaces).find(
        (entry) =>
          entry.name?.startsWith('@boro-biya/') &&
          ['@boro-biya/api', '@boro-biya/relation', '@boro-biya/sos'].includes(entry.name),
      );
      manifest.dependencies = { [service.name]: 'workspace:*' };
      lock.workspaces[''].dependencies = manifest.dependencies;
    }
    if (name === 'config-v0') lock.configVersion = 0;
    if (name === 'lock-v1') lock.lockfileVersion = 1;
    if (name === 'single-root') {
      delete manifest.workspaces;
      manifest.dependencies = {};
      for (const entry of Object.values(lock.workspaces))
        for (const [dependency, version] of Object.entries(entry.dependencies ?? {})) {
          if (!version.startsWith('workspace:')) manifest.dependencies[dependency] = version;
        }
      lock.workspaces = {
        '': { name: manifest.name, dependencies: manifest.dependencies, devDependencies: manifest.devDependencies },
      };
      lock.packages = Object.fromEntries(
        Object.entries(lock.packages).filter(([, entry]) => !entry[0].includes('workspace:')),
      );
    }
    writeFileSync(join(target, 'package.json'), JSON.stringify(manifest, null, 2));
    writeFileSync(join(target, 'bun.lock'), JSON.stringify(lock, null, 2));
    check(name, target);
  }
  return results;
}
