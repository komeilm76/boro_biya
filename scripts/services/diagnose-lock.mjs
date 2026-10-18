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
  for (const name of ['root-runtime', 'unpruned-packages', 'root-runtime-unpruned']) {
    const target = `${output}-diagnostic-${name}`;
    mkdirSync(target);
    cpSync(join(output, 'packages'), join(target, 'packages'), { recursive: true });
    cpSync(join(output, 'services'), join(target, 'services'), { recursive: true });
    const manifest = read(join(output, 'package.json'));
    const lock = read(join(output, 'bun.lock'));
    if (name.startsWith('root-runtime')) {
      manifest.dependencies = {};
      for (const entry of Object.values(lock.workspaces))
        for (const field of ['dependencies'])
          for (const [dependency, version] of Object.entries(entry[field] ?? {})) {
            if (version.startsWith('workspace:')) continue;
            if (manifest.dependencies[dependency] && manifest.dependencies[dependency] !== version)
              throw new Error(`conflicting runtime dependency ${dependency}`);
            manifest.dependencies[dependency] = version;
          }
      lock.workspaces[''].dependencies = manifest.dependencies;
    }
    if (name.includes('unpruned')) lock.packages = read(join(repositoryRoot, 'bun.lock')).packages;
    writeFileSync(join(target, 'package.json'), JSON.stringify(manifest, null, 2));
    writeFileSync(join(target, 'bun.lock'), JSON.stringify(lock, null, 2));
    check(name, target);
  }
  return results;
}
