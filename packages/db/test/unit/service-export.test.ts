import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportService, planService, repositoryRoot, services } from '../../../../scripts/services/export.mjs';

const temporary: string[] = [];
function fresh() {
  const parent = mkdtempSync(join(tmpdir(), 'service-export-unit-'));
  temporary.push(parent);
  return parent;
}
afterEach(() => {
  vi.unstubAllEnvs();
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});
describe('independent service source export (PLG-03, PLG-18, SEC-30)', () => {
  it.each(['core', 'relation', 'sos'] as const)('exports only %s and its runtime source libraries', (service) => {
    const plan = planService(service);
    expect(plan.selected.has(services[service])).toBe(true);
    expect(plan.selected.has('@boro-biya/test-utils')).toBe(false);
    expect(plan.selected.has('@boro-biya/web')).toBe(false);
    const target = join(fresh(), service);
    expect(exportService(service, target)).toBe(target);
    expect(readdirSync(join(target, 'services'))).toEqual([service]);
    for (const path of [
      'apps',
      '.env',
      '.git',
      'node_modules',
      'var',
      'packages/test-utils',
      `services/${service}/test`,
      `services/${service}/dist`,
    ])
      expect(existsSync(join(target, path)), path).toBe(false);
    const manifest = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')) as { workspaces: string[] };
    expect(manifest.workspaces).toEqual(['packages/*', 'services/*']);
    const included = ['packages', 'services'].flatMap((group) =>
      readdirSync(join(target, group)).map((entry) => `${group}/${entry}`),
    );
    expect(included.sort()).toEqual([...plan.selected.values()].map(({ path }) => path).sort());
    expect(readFileSync(join(target, 'bun.lock'), 'utf8')).not.toContain('embedded-postgres');
    const original = JSON.parse(
      readFileSync(join(repositoryRoot, 'bun.lock'), 'utf8').replace(/,(\s*[}\]])/g, '$1'),
    ) as { packages: Record<string, unknown> };
    const exported = JSON.parse(readFileSync(join(target, 'bun.lock'), 'utf8')) as {
      packages: Record<string, unknown>;
    };
    for (const [name, value] of Object.entries(exported.packages)) {
      const normalise = (record: unknown) => JSON.stringify(record).replaceAll('\\\\', '/');
      expect(normalise(value), name).toBe(normalise(original.packages[name]));
    }
  });
  it('exports a container-like source context without Git and excludes a secret tripwire', () => {
    const fixture = join(fresh(), 'context');
    mkdirSync(fixture);
    for (const { path } of planService('relation').selected.values()) {
      mkdirSync(join(fixture, path), { recursive: true });
      for (const entry of ['src', 'migrations', 'package.json', 'tsconfig.build.json']) {
        if (existsSync(join(repositoryRoot, path, entry)))
          cpSync(join(repositoryRoot, path, entry), join(fixture, path, entry), { recursive: true });
      }
    }
    for (const file of [
      'package.json',
      'bun.lock',
      'tsconfig.base.json',
      'scripts/build.mjs',
      'scripts/services/migrate.mjs',
    ]) {
      mkdirSync(dirname(join(fixture, file)), { recursive: true });
      cpSync(join(repositoryRoot, file), join(fixture, file));
    }
    writeFileSync(join(fixture, '.env'), 'DISPOSABLE_EXPORT_TRIPWIRE=never-export-this-test-value');
    const target = join(fresh(), 'output');
    exportService('relation', target, { root: fixture });
    expect(existsSync(join(target, '.env'))).toBe(false);
    const metadata = JSON.parse(readFileSync(join(target, 'service-export.json'), 'utf8')) as { dirty: boolean | null };
    expect(metadata.dirty).toBeNull();
  });
  it('needs neither Bun nor registry metadata to derive the locked source closure', () => {
    const parent = fresh();
    const cache = join(parent, 'absent-package-cache');
    vi.stubEnv('PATH', '');
    vi.stubEnv('BUN_INSTALL_CACHE_DIR', cache);
    const target = join(parent, 'output');
    exportService('relation', target);
    expect(existsSync(join(target, 'bun.lock'))).toBe(true);
    expect(existsSync(cache)).toBe(false);
  });
  it.each(['../core', 'core;echo unsafe', 'toString', 'constructor', 'unknown'])(
    'rejects invalid service %s before writing',
    (service) => {
      const output = join(fresh(), 'output');
      expect(() => exportService(service, output)).toThrow('service must be');
      expect(existsSync(output)).toBe(false);
    },
  );
  it('refuses relative, existing and in-checkout destinations', () => {
    expect(() => exportService('core', 'relative')).toThrow('absolute');
    expect(() => exportService('core', fresh())).toThrow('already exists');
    expect(() => exportService('core', join(repositoryRoot, 'var/new-service'))).toThrow('outside');
    expect(() => exportService('core', repositoryRoot)).toThrow('outside');
    expect(() => exportService('core', join(repositoryRoot, '..hidden/new-service'))).toThrow('outside');
  });
  it('rejects a symlinked destination into the checkout', () => {
    const path = join(fresh(), 'checkout-link');
    symlinkSync(repositoryRoot, path, process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => exportService('relation', join(path, 'var/new-service'))).toThrow('outside');
  });
});
