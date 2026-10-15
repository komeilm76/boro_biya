#!/usr/bin/env node
/**
 * Container image and configuration assertions (QA-14) that run anywhere, without Docker:
 * the vulnerability scan itself (Trivy) runs in CI where images are built. Dependency-free
 * Node (GOV-45). Asserted properties:
 *
 *  Dockerfiles: every FROM is pinned (no `latest`, no bare image name), the final stage runs as
 *  a non-root USER, no ENV/ARG line embeds a secret-looking value, and no ADD pulls a remote
 *  URL. The final (shipped) stage must apply published Debian security updates at build time
 *  (`apt-get upgrade -y`), because upstream base-image rebuilds lag security advisories
 *  (SEC-63). A postgres-based final stage inherits the vendor entrypoint's privilege drop
 *  (initdb needs root; gosu switches to `postgres` at runtime), so the non-root USER rule does
 *  not apply to it — but it must remove the pgdg repository before upgrading so OS security
 *  updates can never drift the pinned PostgreSQL version (QA-47).
 *  docker-compose.yml: every `image:` reference is tag-pinned and not `latest`; every
 *  long-running service declares a healthcheck (the one-shot migrate job is exempt); no
 *  metrics port (9000-9099) is published to the host (OPS-63); resource limits are declared
 *  for the application services (OPS-52); and no `.env` file path is mounted into a container.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const notes = [];

const SECRET_LOOKING = /(password|passwd|secret|token|api[-_]?key|access[-_]?key|private[-_]?key)/i;

// ------------------------------------------------------------------ Dockerfiles
const dockerDir = join(ROOT, 'docker');
const dockerfiles = existsSync(dockerDir) ? readdirSync(dockerDir).filter((name) => name.endsWith('.Dockerfile')) : [];
if (dockerfiles.length === 0) problems.push('no Dockerfiles found under docker/');

for (const name of dockerfiles) {
  const rel = `docker/${name}`;
  const text = readFileSync(join(dockerDir, name), 'utf8');
  const lines = text.split('\n');
  const stages = [];
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    const lineNo = index + 1;
    const from = /^FROM\s+(\S+)(?:\s+AS\s+(\S+))?/i.exec(line);
    if (from) {
      const image = from[1];
      stages.push({ image, alias: from[2] ?? null, lineNo });
      if (!image.includes(':') && !image.includes('@')) {
        problems.push(`${rel}:${lineNo} FROM "${image}" has no tag or digest — pin the base image (QA-14)`);
      }
      if (/:latest($|[^@\w])/i.test(image) || image.endsWith(':latest')) {
        problems.push(`${rel}:${lineNo} FROM "${image}" uses the latest tag (QA-14)`);
      }
    }
    const envLike = /^(ENV|ARG)\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/i.exec(line);
    if (envLike) {
      const [, , variable, value] = envLike;
      const cleanValue = (value ?? '').trim();
      if (
        SECRET_LOOKING.test(variable ?? '') &&
        cleanValue !== '' &&
        !/^\$\{/.test(cleanValue) &&
        cleanValue !== 'dev'
      ) {
        problems.push(`${rel}:${lineNo} ${variable} embeds a secret-looking value in the image (QA-14)`);
      }
    }
    if (/^ADD\s+https?:\/\//i.test(line)) {
      problems.push(`${rel}:${lineNo} ADD pulls a remote URL — fetch at build time via a pinned tool instead (QA-14)`);
    }
  });
  const finalStageUser = (() => {
    let user = null;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (/^FROM\s/i.test(line)) user = null; // reset per stage
      const match = /^USER\s+(\S+)/i.exec(line);
      if (match) user = match[1];
    }
    return user;
  })();
  const finalStage = (() => {
    let fromIndex = -1;
    lines.forEach((rawLine, index) => {
      if (/^\s*FROM\s/i.test(rawLine)) fromIndex = index;
    });
    if (fromIndex < 0) return { image: null, text: '' };
    const image = /^FROM\s+(\S+)/i.exec((lines[fromIndex] ?? '').trim())?.[1] ?? null;
    return { image, text: lines.slice(fromIndex).join('\n') };
  })();
  if (/^postgres:/i.test(finalStage.image ?? '')) {
    // The vendor postgres entrypoint runs initdb as root and drops privileges to `postgres`
    // via gosu at runtime; a USER directive would break initialization (see docker/db.Dockerfile).
    if (!/pgdg/.test(finalStage.text)) {
      problems.push(
        `${rel}: postgres-based final stage must remove the pgdg repository before upgrading — OS security updates must not be able to drift the pinned PostgreSQL version (QA-47)`,
      );
    }
    notes.push(`${rel}: final stage inherits the vendor postgres entrypoint (privilege drop to "postgres" at runtime)`);
  } else if (finalStageUser === null || finalStageUser === 'root') {
    problems.push(`${rel}: the final stage does not switch to a non-root USER (QA-14)`);
  } else {
    notes.push(`${rel}: final stage runs as "${finalStageUser}"`);
  }
  // Shipped layers carry published Debian security fixes: upstream base-image rebuilds lag
  // security advisories, so the final stage upgrades OS packages at build time (SEC-63).
  if (!/apt-get upgrade -y/.test(finalStage.text)) {
    problems.push(
      `${rel}: the final stage does not apply OS security updates ("apt-get upgrade -y") — shipped images must carry published Debian security fixes (SEC-63)`,
    );
  }
  notes.push(`${rel}: ${stages.length} stage(s), base ${stages[0]?.image ?? '?'}`);
}

// ------------------------------------------------------------------ compose file
const composePath = join(ROOT, 'docker-compose.yml');
if (!existsSync(composePath)) {
  problems.push('docker-compose.yml is missing (OPS-66: Compose is the single source of truth for service versions)');
} else {
  const text = readFileSync(composePath, 'utf8');
  const lines = text.split('\n');
  let inServices = false;
  let currentService = null;
  const services = new Map();
  lines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    const line = rawLine.replace(/\t/g, '  ');
    if (/^\S/.test(line) && line.trim() !== '') {
      // A top-level key: only the `services:` block contains service definitions.
      inServices = /^services:\s*$/.test(line);
      currentService = null;
      return;
    }
    if (!inServices) return;
    const serviceMatch = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line);
    if (serviceMatch) {
      currentService = serviceMatch[1] ?? null;
      if (currentService !== null)
        services.set(currentService, { healthcheck: false, image: null, ports: [], limits: false, restart: null });
      return;
    }
    if (currentService === null) return;
    const record = services.get(currentService);
    if (record === undefined) return;
    const imageMatch = /^\s+image:\s*(\S+)/.exec(line);
    if (imageMatch) record.image = imageMatch[1];
    if (/^\s+healthcheck:/.test(line)) record.healthcheck = true;
    if (/^\s+ports:/.test(line)) record.inPorts = true;
    else if (record.inPorts === true) {
      if (/^\s+-\s/.test(line)) {
        record.ports.push(line);
      } else if (/^\s+[a-z]/.test(line)) {
        record.inPorts = false;
      }
    }
    const restartMatch = /^\s+restart:\s*"?([a-z-]+)"?/.exec(line);
    if (restartMatch) record.restart = restartMatch[1] ?? null;
    if (/^\s+limits:/.test(line)) record.limits = true;
    const volumeLike = /^\s+-\s+.*\.env/.exec(line);
    if (volumeLike)
      problems.push(
        `docker-compose.yml:${lineNo} mounts an env file into a container (QA-14: no secrets in images or mounts)`,
      );
    const published = /^\s+-\s+"?\$\{[A-Z_]+:-?(\d+)\}?:(\d+)"?/.exec(line);
    if (published) {
      const hostPort = Number(published[2]);
      if (hostPort >= 9000 && hostPort <= 9099) {
        problems.push(
          `docker-compose.yml:${lineNo} publishes port ${hostPort} — the metrics interface must stay non-public (OPS-63)`,
        );
      }
    }
  });

  for (const [name, record] of services) {
    if (record.image !== null) {
      const image = record.image;
      const isLocalBuild = image.startsWith('boro-biya/');
      if (!isLocalBuild) {
        if (!image.includes(':'))
          problems.push(`docker-compose.yml service "${name}": image "${image}" has no pinned tag (QA-14)`);
        if (image.endsWith(':latest'))
          problems.push(`docker-compose.yml service "${name}": image "${image}" uses latest (QA-14)`);
      } else if (image.endsWith(':latest')) {
        problems.push(`docker-compose.yml service "${name}": image "${image}" uses latest (QA-14)`);
      }
    }
    const longRunning = record.restart !== 'no' && record.restart !== '"no"';
    if (longRunning && !record.healthcheck) {
      problems.push(`docker-compose.yml service "${name}": long-running service without a healthcheck (QA-14)`);
    }
    if (longRunning && name !== 'db' && !record.limits) {
      problems.push(`docker-compose.yml service "${name}": no resource limits declared (OPS-52)`);
    }
    notes.push(
      `compose service "${name}": image=${record.image ?? 'built'} healthcheck=${record.healthcheck ? 'yes' : 'no'} restart=${record.restart ?? 'default'}`,
    );
  }
}

if (problems.length > 0) {
  process.stderr.write('container configuration check FAILED:\n');
  for (const problem of problems) process.stderr.write(`  - ${problem}\n`);
  process.exit(1);
}
process.stdout.write('container configuration check passed (QA-14 assertions):\n');
for (const note of notes) process.stdout.write(`  · ${note}\n`);
