#!/usr/bin/env node
/**
 * Verify Compose's effective host port configuration (including interpolation) and, in CI,
 * the live Docker Engine bindings after the stack starts. Also exercise the documented Engine
 * version/firewalld risk boundaries. Dependency-free Node tooling (GOV-45).
 *
 * Usage:
 *   node scripts/check-compose-network.mjs              # Compose config + version matrix
 *   node scripts/check-compose-network.mjs --runtime    # also inspect live container bindings
 *   node scripts/check-compose-network.mjs --versions-only
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const COMPOSE_FILE = join(ROOT, 'docker-compose.yml');
const DOCS = join(ROOT, 'docs', 'development', '01-development-environment.md');
const OPERATIONS = join(ROOT, 'docs', 'operations', 'README.md');
const INTERNAL_SERVICES = ['api', 'relation', 'sos'];
const DOCKER_COMPOSE_ENV = [
  'API_PORT',
  'DB_PORT',
  'RELATION_PORT',
  'SOS_PORT',
  'WEB_PORT',
  'WEB_PUBLISH_ADDRESS',
  'POSTGRES_PASSWORD',
  'CORE_DB_PASSWORD',
  'RELATION_DB_PASSWORD',
  'SOS_DB_PASSWORD',
];

function versionTuple(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value);
  assert.ok(match, `invalid Docker Engine version: ${value}`);
  return match.slice(1, 4).map(Number);
}

function compareVersions(left, right) {
  const a = versionTuple(left);
  const b = versionTuple(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

/** The specific bridge/iptables loopback-publishing exposure fixed by Moby #49325. */
function loopbackPublishedPortExposed(engineVersion, { rawTableFiltering = true } = {}) {
  return compareVersions(engineVersion, '28.0.0') < 0 || !rawTableFiltering;
}

/** CVE-2025-54388 requires the affected release range and a firewalld reload. */
function firewalldReloadExposure(
  engineVersion,
  { firewalldRunning = true, reloaded = true, engineInHostNetworkNamespace = true } = {},
) {
  const affectedVersion = compareVersions(engineVersion, '28.2.0') >= 0 && compareVersions(engineVersion, '28.3.3') < 0;
  return firewalldRunning && reloaded && engineInHostNetworkNamespace && affectedVersion;
}

function checkVersionMatrix() {
  assert.equal(loopbackPublishedPortExposed('27.5.1'), true, 'pre-28 Engine is affected');
  assert.equal(loopbackPublishedPortExposed('28.0.0'), false, '28.0.0 includes the loopback fix');
  assert.equal(
    loopbackPublishedPortExposed('28.5.1', { rawTableFiltering: false }),
    true,
    'disabling raw-table filtering removes the loopback ingress protection',
  );
  assert.equal(firewalldReloadExposure('28.1.9'), false, 'versions before 28.2.0 are not affected');
  assert.equal(firewalldReloadExposure('28.2.0'), true, 'the affected firewalld range starts at 28.2.0');
  assert.equal(firewalldReloadExposure('28.3.2'), true, 'the affected firewalld range ends before 28.3.3');
  assert.equal(firewalldReloadExposure('28.3.3'), false, '28.3.3 contains the firewalld fix');
  assert.equal(firewalldReloadExposure('28.3.2', { reloaded: false }), false, 'no reload, no trigger');
  assert.equal(
    firewalldReloadExposure('28.3.2', { engineInHostNetworkNamespace: false }),
    false,
    'Rootless Mode and Docker Desktop are outside this host-network-namespace issue',
  );
  assert.equal(firewalldReloadExposure('28.3.2', { firewalldRunning: false }), false, 'the CVE requires firewalld');
}

function composeEnv(overrides = {}) {
  const env = { ...process.env };
  for (const key of DOCKER_COMPOSE_ENV) delete env[key];
  env.COMPOSE_DISABLE_ENV_FILE = '1';
  return { ...env, ...overrides };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: options.env ?? composeEnv(),
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw new Error(`${command} could not run: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} exited ${result.status}:\n${result.stdout ?? ''}${result.stderr ?? ''}`,
    );
  }
  return result.stdout.trim();
}

function normalizePort(port) {
  return {
    target: Number(port.target),
    published: Number(port.published),
    host_ip: port.host_ip ?? '',
    protocol: port.protocol ?? 'tcp',
  };
}

function portsFor(service) {
  return (service.ports ?? []).map(normalizePort).sort((a, b) => a.target - b.target);
}

function expectedSinglePort(config, serviceName, expected) {
  const service = config.services?.[serviceName];
  assert.ok(service, `Compose service ${serviceName} exists`);
  assert.deepEqual(portsFor(service), [expected], `${serviceName} effective host port binding`);
}

function checkPublishedPortSet(config) {
  const published = [];
  for (const [serviceName, service] of Object.entries(config.services ?? {})) {
    for (const port of portsFor(service)) published.push({ service: serviceName, ...port });
  }
  published.sort((a, b) => a.service.localeCompare(b.service) || a.target - b.target);
  assert.deepEqual(
    published,
    [
      { service: 'db', target: 5432, published: 5432, host_ip: '127.0.0.1', protocol: 'tcp' },
      { service: 'web', target: 8080, published: 8080, host_ip: '127.0.0.1', protocol: 'tcp' },
    ],
    'only PostgreSQL and the web edge are published, on loopback and TCP',
  );
  for (const name of INTERNAL_SERVICES) {
    assert.deepEqual(portsFor(config.services[name]), [], `${name} must not be host-published`);
  }
}

function composeConfig(envFilePath, useProjectEnvironment = false) {
  const args = ['compose', '--project-directory', ROOT];
  if (envFilePath !== null) args.push('--env-file', envFilePath);
  args.push('-f', COMPOSE_FILE, 'config', '--format', 'json');
  return JSON.parse(run('docker', args, { env: useProjectEnvironment ? process.env : composeEnv() }));
}

function checkApiForwardingDocumentation() {
  const development = readFileSync(DOCS, 'utf8');
  const operations = readFileSync(OPERATIONS, 'utf8');
  assert.match(development, /WEB_PUBLISH_ADDRESS/);
  assert.match(development, /widening it also exposes the web edge's forwarded `\/api\/\*` requests/i);
  assert.match(operations, /widen(?:s)? `WEB_PUBLISH_ADDRESS`[^\n]*forwarded `\/api\/\*`/i);
}

function checkComposeConfig() {
  const tempDir = mkdtempSync(join(os.tmpdir(), 'boro-compose-network-'));
  const envPath = join(tempDir, 'compose.env');
  const commonEnv = [
    'POSTGRES_PASSWORD=compose-network-test-only',
    'CORE_DB_PASSWORD=compose-network-test-only',
    'RELATION_DB_PASSWORD=compose-network-test-only',
    'SOS_DB_PASSWORD=compose-network-test-only',
    'DB_PORT=5432',
    'WEB_PORT=8080',
  ];
  try {
    // WEB_PUBLISH_ADDRESS is deliberately absent in this case: exercise Compose's default.
    writeFileSync(envPath, `${commonEnv.join('\n')}\n`, 'utf8');
    const defaults = composeConfig(envPath);
    checkPublishedPortSet(defaults);

    // An explicit wider host IP must affect only web's host binding, never internal services or DB.
    writeFileSync(envPath, `${commonEnv.join('\n')}\nWEB_PUBLISH_ADDRESS=192.0.2.10\n`, 'utf8');
    const widened = composeConfig(envPath);
    expectedSinglePort(widened, 'db', {
      target: 5432,
      published: 5432,
      host_ip: '127.0.0.1',
      protocol: 'tcp',
    });
    expectedSinglePort(widened, 'web', {
      target: 8080,
      published: 8080,
      host_ip: '192.0.2.10',
      protocol: 'tcp',
    });
    for (const name of INTERNAL_SERVICES) {
      assert.deepEqual(portsFor(widened.services[name]), [], `${name} stays unpublished when web widens`);
    }
    const serviceNames = new Set([...Object.keys(defaults.services ?? {}), ...Object.keys(widened.services ?? {})]);
    for (const name of serviceNames) {
      const before = portsFor(defaults.services[name]);
      const after = portsFor(widened.services[name]);
      if (name === 'web') {
        assert.deepEqual(
          before.map(({ host_ip: _host, ...rest }) => rest),
          after.map(({ host_ip: _host, ...rest }) => rest),
          'widening changes only the web host IP, not its container port, host port, or protocol',
        );
      } else {
        assert.deepEqual(after, before, `widening the web edge must not alter ${name}`);
      }
    }
    checkApiForwardingDocumentation();
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function inspectPortBindings(serviceName, expectedPorts) {
  const id = run('docker', ['compose', 'ps', '-q', serviceName]);
  assert.ok(id, `${serviceName} Compose container is running`);
  const raw = run('docker', ['inspect', '--format={{json .NetworkSettings.Ports}}', id]);
  const mappings = JSON.parse(raw || '{}') ?? {};
  const actual = [];
  for (const [containerPort, bindings] of Object.entries(mappings)) {
    for (const binding of bindings ?? []) {
      actual.push({
        target: Number(containerPort.split('/')[0]),
        protocol: containerPort.split('/')[1] ?? 'tcp',
        host_ip: binding.HostIp,
        published: Number(binding.HostPort),
      });
    }
  }
  actual.sort((a, b) => a.target - b.target);
  assert.deepEqual(actual, expectedPorts, `${serviceName} live Docker Engine port bindings`);
}

function checkLiveBindings() {
  const config = composeConfig(null, true);
  checkPublishedPortSet(config);
  for (const serviceName of ['db', ...INTERNAL_SERVICES, 'web']) {
    inspectPortBindings(serviceName, portsFor(config.services[serviceName]));
  }
}

checkVersionMatrix();
process.stdout.write('Docker Engine version matrix: loopback and firewalld boundaries PASS\n');

if (process.argv.includes('--versions-only')) {
  process.exit(0);
}

checkComposeConfig();
process.stdout.write('Compose effective configuration: default and explicit web binding PASS\n');

if (process.argv.includes('--runtime')) {
  checkLiveBindings();
  process.stdout.write('Docker Engine live bindings: db/web loopback-only; internal ports unpublished PASS\n');
}
