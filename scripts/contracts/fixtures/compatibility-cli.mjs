import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const mode = process.argv[2];
assert(['valid', 'removed', 'missing', 'malformed', 'usage'].includes(mode));
const root = fileURLToPath(new URL('../../../', import.meta.url));
await mkdir(join(root, 'tmp'), { recursive: true });
const directory = await mkdtemp(join(root, 'tmp', 'compatibility-cli-'));
try {
  const baseline = JSON.parse(await readFile(new URL('./openapi31.json', import.meta.url), 'utf8'));
  const candidate = structuredClone(baseline);
  if (mode === 'removed') delete candidate.paths['/fixtures/{id}'];
  const before = join(directory, mode === 'missing' ? 'invented-sensitive-marker-missing.json' : 'released.json');
  const after = join(directory, 'candidate.json');
  if (mode !== 'missing')
    await writeFile(
      before,
      mode === 'malformed' ? 'invented-sensitive-marker-malformed-json' : JSON.stringify(baseline),
    );
  await writeFile(after, JSON.stringify(candidate));
  const result = spawnSync(
    'bun',
    ['scripts/contracts/compatibility.mjs', ...(mode === 'usage' ? [] : [before, after])],
    { cwd: root, encoding: 'utf8', timeout: 30_000 },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, mode === 'valid' ? 0 : mode === 'removed' ? 1 : 2);
  assert(!result.stderr.includes('invented-sensitive-marker'));
  if (mode === 'valid' || mode === 'removed') assert.equal(JSON.parse(result.stdout).compatible, mode === 'valid');
} finally {
  await rm(directory, { recursive: true, force: true });
}
console.log(`compatibility CLI ${mode} passed`);
