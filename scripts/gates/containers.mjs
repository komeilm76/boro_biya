import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const failures = [];
const services = {
  api: 'apps/api/Dockerfile',
  relation: 'services/relation/Dockerfile',
  sos: 'services/sos/Dockerfile',
  web: 'apps/web/Dockerfile',
};
const runtimeImages = new Map([
  ['api', 'node:24-bookworm-slim'],
  ['relation', 'node:24-bookworm-slim'],
  ['sos', 'node:24-bookworm-slim'],
  ['web', 'node:24-bookworm-slim'],
]);

for (const [service, relativePath] of Object.entries(services)) {
  const dockerfile = readFileSync(resolve(root, relativePath), 'utf8');
  const fromLines = dockerfile.split(/\r?\n/).filter((line) => /^\s*FROM\s+/i.test(line));
  const images = fromLines.map((line) => line.trim().split(/\s+/)[1]);
  if (images.some((image) => !image || /:(?:latest|$)/i.test(image))) {
    failures.push(`${relativePath}: every base image must carry a non-floating tag`);
  }
  if (!images.includes('oven/bun:1.4.3')) {
    failures.push(`${relativePath}: build stage must use the pinned Bun 1.4.3 toolchain`);
  }
  if (!images.includes(runtimeImages.get(service))) {
    failures.push(`${relativePath}: runtime stage must use Node 24 on bookworm-slim`);
  }
  if (!/^USER\s+node\s*$/m.test(dockerfile))
    failures.push(`${relativePath}: runtime must switch to the non-root node user`);
  if (!/^HEALTHCHECK\s+/m.test(dockerfile))
    failures.push(`${relativePath}: runtime health check is missing`);
  if (/^\s*(?:ARG|ENV)\s+[^\n]*(?:PASSWORD|SECRET|TOKEN|API_KEY)\s*=/im.test(dockerfile)) {
    failures.push(
      `${relativePath}: credentials must not be embedded in Dockerfile ARG or ENV declarations`,
    );
  }
  if (/^\s*COPY\s+[^\n]*\.env(?:\s|$)/im.test(dockerfile))
    failures.push(`${relativePath}: local environment files must not enter an image`);

  const productionInstall = dockerfile.indexOf('RUN bun install --frozen-lockfile --production');
  const runtimeStoreCopy = dockerfile.indexOf('/workspace/node_modules/.bun ./node_modules/.bun');
  if (service !== 'web' && productionInstall < 0) {
    failures.push(
      `${relativePath}: production dependencies must be pruned before copying the shared store`,
    );
  }
  if (service !== 'web' && runtimeStoreCopy >= 0 && productionInstall > runtimeStoreCopy) {
    failures.push(
      `${relativePath}: production dependency pruning must happen before copying the shared store`,
    );
  }
  if (service !== 'web' && runtimeStoreCopy < 0) {
    failures.push(
      `${relativePath}: production image is missing the Bun-installed external dependency store required by workspace links`,
    );
  }
}

const compose = readFileSync(resolve(root, 'compose.yaml'), 'utf8');
for (const service of Object.keys(services)) {
  const imagePattern = new RegExp(`image:\\s+boro-biya/${service}:phase1\\b`);
  if (!imagePattern.test(compose))
    failures.push(`compose.yaml: ${service} image must use an explicit Phase 1 tag`);
}
if (!/image:\s+postgres:18\.6-alpine\b/.test(compose))
  failures.push('compose.yaml: PostgreSQL 18.6 Alpine image is not pinned');
const publishedPorts = [
  { name: 'POSTGRES_PUBLISHED_PORT', host: 5432, container: 5432 },
  { name: 'API_PUBLISHED_PORT', host: 3000, container: 3000 },
  { name: 'RELATION_PUBLISHED_PORT', host: 3001, container: 3001 },
  { name: 'SOS_PUBLISHED_PORT', host: 3002, container: 3002 },
  { name: 'WEB_PUBLISHED_PORT', host: 5173, container: 4173 },
];
const environmentExample = readFileSync(resolve(root, '.env.example'), 'utf8');
for (const port of publishedPorts) {
  const binding = new RegExp(
    `127\\.0\\.0\\.1:\\$\\{${port.name}:-${port.host}\\}:${port.container}`,
  );
  if (!binding.test(compose)) {
    failures.push(`compose.yaml: ${port.name} must bind to loopback with default ${port.host}`);
  }
  if (!new RegExp(`^${port.name}=<\\d+>$`, 'm').test(environmentExample)) {
    failures.push(`.env.example: ${port.name} must be listed as an overridable published port`);
  }
}
if (/\b(?:postgres|node|oven\/bun):latest\b/i.test(compose))
  failures.push('compose.yaml: floating latest image tag is forbidden');

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`[containers] ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    'container configuration passed: pinned base tags, Node 24 runtime, non-root users, health checks, no embedded credentials, loopback-only published ports\n',
  );
}
