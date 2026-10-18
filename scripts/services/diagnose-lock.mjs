// Failure-only, offline diagnostics. Never changes the original checkout or weakens an assertion.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
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
  check('canonical-cwd', realpathSync(output));
  for (const name of ['plain-cwd', 'native-keys', 'native-resolutions', 'fresh-repository']) {
    const target =
      name === 'plain-cwd'
        ? join(dirname(repositoryRoot), `${basename(dirname(output))}-${basename(output)}-plain`)
        : `${output}-diagnostic-${name}`;
    try {
      mkdirSync(target);
      const from = name === 'fresh-repository' ? repositoryRoot : output;
      const manifest = read(join(from, 'package.json'));
      const lock = read(join(from, 'bun.lock'));
      for (const path of Object.keys(lock.workspaces)) {
        if (!path) continue;
        mkdirSync(join(target, path), { recursive: true });
        cpSync(join(from, path, 'package.json'), join(target, path, 'package.json'));
      }
      if (name === 'native-keys')
        lock.workspaces = Object.fromEntries(
          Object.entries(lock.workspaces).map(([path, value]) => [path.replaceAll('/', '\\'), value]),
        );
      if (name === 'native-resolutions')
        for (const value of Object.values(lock.packages))
          if (value[0].includes('@workspace:')) {
            const [name, path] = value[0].split('@workspace:');
            value[0] = `${name}@workspace:${path.replaceAll('/', '\\')}`;
          }
      writeFileSync(join(target, 'package.json'), JSON.stringify(manifest, null, 2));
      writeFileSync(join(target, 'bun.lock'), JSON.stringify(lock, null, 2));
      check(name, target);
    } catch {
      results[name] = 'diagnostic-error';
    } finally {
      // The sibling checkout-volume fixture is not under the integration test's temp parent.
      if (name === 'plain-cwd') rmSync(target, { recursive: true, force: true });
    }
  }
  return results;
}
