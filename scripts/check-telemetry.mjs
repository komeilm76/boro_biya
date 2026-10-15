#!/usr/bin/env node
/**
 * Privacy gate for the dependency tree (PRIV-19, GOV-40): the default build contains no
 * analytics, telemetry, or tracker dependency, and transitive surprises are surfaced as findings
 * for review before merge. Dependency-free Node (GOV-45).
 *
 * Three layers:
 *  1. a denylist of known analytics/telemetry/tracker package names over the installed tree;
 *  2. an inventory of packages that run install scripts (printed as review findings, GOV-40);
 *  3. when the built web bundle exists, a scan of its emitted files for known tracker endpoints.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DENYLIST = [
  /(^|[/.-])analytics([/.-]|$)/i,
  /(^|[/.-])telemetry([/.-]|$)/i,
  /(^|[/-])sentry([/-]|$)/i,
  /@sentry\//i,
  /(^|[/-])segment([/-]|$)/i,
  /@segment\//i,
  /mixpanel/i,
  /amplitude/i,
  /posthog/i,
  /matomo/i,
  /piwik/i,
  /hotjar/i,
  /clarity/i,
  /fullstory/i,
  /logrocket/i,
  /bugsnag/i,
  /rollbar/i,
  /datadog/i,
  /new-?relic/i,
  /snowplow/i,
  /gtag/i,
  /google-?analytics/i,
  /googletagmanager/i,
  /doubleclick/i,
  /facebook.*(pixel|tracker)/i,
  /(^|[/-])tracker([/-]|$)/i,
  /(^|[/-])tracking([/-]|$)/i,
];

const TRACKER_ENDPOINTS = [
  'google-analytics.com',
  'googletagmanager.com',
  'doubleclick.net',
  'connect.facebook.net',
  'hotjar.com',
  'sentry.io',
  'browser.sentry-cdn.com',
  'mixpanel.com',
  'segment.io',
  'segment.com',
  'amplitude.com',
  'posthog.com',
  'matomo.cloud',
  'clarity.ms',
  'fullstory.com',
  'logrocket.io',
  'bugsnag.com',
  'rollbar.com',
  'datadoghq.com',
  'newrelic.com',
];

function* walkPackages(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.bin' || entry.name === '.cache') continue;
    const full = join(dir, entry.name);
    if (entry.name.startsWith('@') && !entry.name.includes('+')) {
      yield* walkPackages(full);
      continue;
    }
    const manifestPath = join(full, 'package.json');
    try {
      if (!statSync(full).isDirectory()) continue;
    } catch {
      continue;
    }
    if (!existsSync(manifestPath)) {
      yield* walkPackages(join(full, 'node_modules'));
      continue;
    }
    try {
      yield JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      continue;
    }
  }
}

const seen = new Map();
for (const base of [join(ROOT, 'node_modules'), join(ROOT, 'node_modules', '.bun')]) {
  for (const manifest of walkPackages(base)) {
    if (typeof manifest.name !== 'string' || manifest.name.startsWith('@boro-biya/')) continue;
    seen.set(`${manifest.name}@${manifest.version}`, manifest);
  }
}
for (const group of ['packages', 'apps', 'services']) {
  const groupDir = join(ROOT, group);
  if (!existsSync(groupDir)) continue;
  for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const manifest of walkPackages(join(groupDir, entry.name, 'node_modules'))) {
      if (typeof manifest.name !== 'string' || manifest.name.startsWith('@boro-biya/')) continue;
      seen.set(`${manifest.name}@${manifest.version}`, manifest);
    }
  }
}

const denyHits = [];
const installScripts = [];
for (const [id, manifest] of seen) {
  for (const pattern of DENYLIST) {
    if (pattern.test(manifest.name)) {
      denyHits.push(`${id} matches the telemetry/analytics denylist pattern ${pattern}`);
      break;
    }
  }
  const scripts = manifest.scripts ?? {};
  const phases = ['preinstall', 'install', 'postinstall'].filter(
    (phase) => typeof scripts[phase] === 'string' && scripts[phase].trim() !== '',
  );
  if (phases.length > 0) {
    installScripts.push(`${id}: ${phases.join(', ')}`);
  }
}

process.stdout.write(`telemetry check: ${seen.size} packages inspected\n`);
if (installScripts.length > 0) {
  process.stdout.write('install-script inventory (review findings, GOV-40):\n');
  for (const entry of installScripts.sort()) process.stdout.write(`  · ${entry}\n`);
}

// Bundle scan: the built web artefact must not name a tracker endpoint.
const distDir = join(ROOT, 'apps', 'web', 'dist');
if (existsSync(distDir)) {
  const walkFiles = (dir) => {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walkFiles(full));
      else out.push(full);
    }
    return out;
  };
  for (const file of walkFiles(distDir)) {
    if (!/\.(js|mjs|css|html|json|map)$/.test(file)) continue;
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const endpoint of TRACKER_ENDPOINTS) {
      if (text.includes(endpoint)) denyHits.push(`built bundle ${file} references tracker endpoint ${endpoint}`);
    }
  }
  process.stdout.write(`telemetry check: web bundle scanned (${distDir})\n`);
} else {
  process.stdout.write('telemetry check: no built web bundle found (run after `bun run build` for the bundle scan)\n');
}

if (denyHits.length > 0) {
  process.stderr.write(
    'telemetry check FAILED (PRIV-19: the default build contains no analytics, telemetry, or tracker dependency):\n',
  );
  for (const hit of denyHits) process.stderr.write(`  - ${hit}\n`);
  process.exit(1);
}
process.stdout.write(
  'telemetry check passed: no analytics, telemetry, or tracker dependency in the tree or the bundle\n',
);
