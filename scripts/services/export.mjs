#!/usr/bin/env node
// Source export, not an application upload/install endpoint. Only reviewed local source is read.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const services = Object.freeze({
  core: '@boro-biya/api',
  relation: '@boro-biya/relation',
  sos: '@boro-biya/sos',
});
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');

export function planService(service, root = repositoryRoot) {
  if (!Object.hasOwn(services, service)) throw new Error('service must be core, relation or sos');
  const rootManifest = json(join(root, 'package.json'));
  const selected = new Map();
  function add(path) {
    const manifest = json(join(root, path, 'package.json'));
    if (selected.has(manifest.name)) return;
    selected.set(manifest.name, { path, manifest });
    for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
      if (!version.startsWith('workspace:')) continue;
      if (!name.startsWith('@boro-biya/') || name === '@boro-biya/test-utils')
        throw new Error(`invalid runtime dependency ${name}`);
      add(`packages/${name.slice('@boro-biya/'.length)}`);
    }
  }
  add(`services/${service}`);
  const devDependencies = {
    typescript: rootManifest.devDependencies.typescript,
    '@types/node': rootManifest.devDependencies['@types/node'],
  };
  for (const { manifest } of selected.values()) {
    for (const [name, version] of Object.entries(manifest.devDependencies ?? {})) {
      if (version.startsWith('workspace:')) continue;
      if (devDependencies[name] !== undefined && devDependencies[name] !== version)
        throw new Error(`conflicting build dependency ${name}`);
      devDependencies[name] = version;
    }
  }
  return {
    selected,
    manifest: {
      name: `standalone-${service}`,
      version: rootManifest.version,
      private: true,
      type: 'module',
      license: rootManifest.license,
      engines: rootManifest.engines,
      workspaces: [...selected.values()].map(({ path }) => path),
      scripts: {
        build: `node scripts/build.mjs --filter=${services[service]}`,
        start: `node services/${service}/dist/main.js`,
        'db:up': `node scripts/services/migrate.mjs ${service} up`,
        'db:status': `node scripts/services/migrate.mjs ${service} status`,
        'db:down': `node scripts/services/migrate.mjs ${service} down`,
      },
      devDependencies,
    },
  };
}

export function exportService(service, output, { root = repositoryRoot, bun = 'bun' } = {}) {
  const plan = planService(service, root);
  if (!output || !isAbsolute(output)) throw new Error('output must be an absolute path outside the checkout');
  output = resolve(output);
  let ancestor = output;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const actual = resolve(realpathSync(ancestor), relative(ancestor, output));
  const inRoot = relative(realpathSync(root), actual);
  if (
    inRoot === '' ||
    (inRoot !== '..' && !inRoot.startsWith('../') && !inRoot.startsWith('..\\') && !isAbsolute(inRoot))
  )
    throw new Error('output must be outside the checkout');
  if (existsSync(output)) throw new Error('output already exists; refusing to overwrite it');
  mkdirSync(dirname(output), { recursive: true });
  mkdirSync(output); // exclusive: never merge into an existing project
  for (const { path, manifest } of plan.selected.values()) {
    const target = join(output, path);
    mkdirSync(target, { recursive: true });
    for (const entry of ['src', 'migrations', 'tsconfig.build.json']) {
      if (existsSync(join(root, path, entry)))
        cpSync(join(root, path, entry), join(target, entry), { recursive: true, dereference: false });
    }
    const clean = { ...manifest };
    delete clean.devDependencies;
    clean.scripts = { build: manifest.scripts.build, start: manifest.scripts.start ?? 'node dist/index.js' };
    writeJson(join(target, 'package.json'), clean);
  }
  writeJson(join(output, 'package.json'), plan.manifest);
  const base = json(join(root, 'tsconfig.base.json'));
  delete base.compilerOptions.paths;
  writeJson(join(output, 'tsconfig.base.json'), base);
  mkdirSync(join(output, 'scripts/services'), { recursive: true });
  for (const file of ['scripts/build.mjs', 'scripts/services/migrate.mjs'])
    cpSync(join(root, file), join(output, file));
  // Seed matching workspace metadata from the reviewed lock; retain exact registry resolutions.
  const parseLock = (path) => JSON.parse(readFileSync(path, 'utf8').replace(/,(\s*[}\]])/g, '$1'));
  const seed = parseLock(join(root, 'bun.lock'));
  seed.workspaces = { '': { name: plan.manifest.name, devDependencies: plan.manifest.devDependencies } };
  for (const { path } of plan.selected.values()) {
    const manifest = json(join(output, path, 'package.json'));
    seed.workspaces[path] = Object.fromEntries(
      ['name', 'version', 'dependencies', 'peerDependencies', 'bin']
        .filter((key) => manifest[key] !== undefined)
        .map((key) => [key, manifest[key]]),
    );
  }
  for (const [name, value] of Object.entries(seed.packages)) {
    if (String(value[0]).includes('workspace:') && !plan.selected.has(name)) delete seed.packages[name];
  }
  writeJson(join(output, 'bun.lock'), seed);
  // Prune offline, then reject any changed registry resolution.
  execFileSync(bun, ['install', '--lockfile-only', '--offline', '--ignore-scripts'], { cwd: output, stdio: 'pipe' });
  const original = parseLock(join(root, 'bun.lock')).packages;
  const exported = parseLock(join(output, 'bun.lock')).packages;
  const reviewedResolutions = new Set(Object.values(original).map((value) => JSON.stringify(value)));
  for (const [name, value] of Object.entries(exported)) {
    if (String(value[0]).includes('workspace:')) continue;
    if (!reviewedResolutions.has(JSON.stringify(value))) throw new Error(`export changed locked dependency ${name}`);
  }
  let source = process.env.BUILD_COMMIT ?? 'unknown';
  let dirty = null;
  try {
    source = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    dirty =
      execFileSync('git', ['status', '--porcelain'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() !== '';
  } catch {
    /* Image build contexts deliberately omit Git; use the supplied build stamp. */
  }
  writeJson(join(output, 'service-export.json'), {
    service,
    workspace: services[service],
    source,
    dirty,
    packages: [...plan.selected.keys()],
  });
  writeFileSync(
    join(output, 'README.md'),
    `# Standalone ${service} service\n\nReviewed source with its required library closure; no other service or client is included.\nUse Node 24 and Bun 1.4. Run bun install --frozen-lockfile --ignore-scripts, bun run build, then bun run start.\nSet NODE_ENV to development, test or production. Provision PostgreSQL and inject DATABASE_URL (least-privilege runtime role). For migrations use DB_ADMIN_URL and SERVICE_DB_PASSWORD in the deployment environment, then bun run db:up. Use bun run db:status or bun run db:down (one migration) for maintenance. Never give administrative credentials to the runtime process.\nCore also requires WEB_ORIGIN and SESSION_SECRET. All configuration is validated at startup. /healthz and /readyz are infrastructure endpoints. Metrics stay private.\nRelation and SOS are skeletons: domain routes arrive in Phases 4 and 5. No deployment automatically grants inter-service or user permissions.\nNo .env, node_modules, test databases, uploaded code, ZIP installer or application orchestration is exported.\n`,
  );
  return output;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4)
      throw new Error('usage: node scripts/services/export.mjs core|relation|sos /absolute/new/directory');
    console.log(exportService(process.argv[2], process.argv[3]));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
