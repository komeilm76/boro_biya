// Run with Bun: the pinned zopia public entry point contains TypeScript.
// A conservative compatibility proof: additions are allowed only where existing
// operation contracts cannot change. Unknown/semantic changes block, never pass.
import SwaggerParser from '@apidevtools/swagger-parser';
import { diffOpenApiDocuments } from 'zopia';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const componentGroups = new Set([
  'schemas',
  'responses',
  'parameters',
  'examples',
  'requestBodies',
  'headers',
  'securitySchemes',
  'links',
  'callbacks',
  'pathItems',
]);
const methods = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
const pointer = (key) => String(key).replaceAll('~', '~0').replaceAll('/', '~1');
const own = (object, key) => object !== undefined && Object.hasOwn(object, key);
const normalise = (value) =>
  Array.isArray(value)
    ? value.map(normalise)
    : value !== null && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, normalise(value[key])]),
        )
      : value;
const equal = (left, right) => JSON.stringify(normalise(left)) === JSON.stringify(normalise(right));

async function validate(document) {
  if (typeof document?.openapi !== 'string' || !/^3\.1\.\d+$/.test(document.openapi))
    throw new Error('Compatibility requires two explicit OpenAPI 3.1 documents');
  const inspectReferences = (value) => {
    if (value === null || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (['$ref', '$dynamicRef'].includes(key) && typeof child === 'string' && !child.startsWith('#'))
        throw new Error('Compatibility requires bundled local references');
      inspectReferences(child);
    }
  };
  inspectReferences(document);
  // Validation/dereferencing must not mutate the source used by either comparison.
  await SwaggerParser.validate(structuredClone(document), { resolve: { http: false, file: false } });
}

export async function checkContractCompatibility(previous, candidate) {
  await validate(previous);
  await validate(candidate);
  const findings = [];
  const changed = (at) => findings.push({ kind: 'unproven', at });
  const removed = (at) => findings.push({ kind: 'removed', at });
  const keys = (left, right) => [...new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})])].sort();

  // Defaults (especially security, servers, dialect and extensions) affect every
  // operation. An added default is not treated as an innocuous additive field.
  for (const key of keys(previous, candidate)) {
    if (['paths', 'components', 'info'].includes(key)) continue;
    if (!equal(previous[key], candidate[key])) changed(`#/${pointer(key)}`);
  }
  // A release's display version can change without changing a wire/API version.
  // All other information is conservatively retained, including unknown extensions.
  const withoutVersion = ({ version: _version, ...info }) => info;
  if (!equal(withoutVersion(previous.info), withoutVersion(candidate.info))) changed('#/info');

  for (const path of keys(previous.paths, candidate.paths)) {
    const at = `#/paths/${pointer(path)}`;
    if (!path.startsWith('/')) {
      if (!equal(previous.paths?.[path], candidate.paths?.[path])) changed(at);
      continue;
    }
    if (!own(previous.paths, path)) continue;
    if (!own(candidate.paths, path)) {
      removed(at);
      continue;
    }
    const before = previous.paths[path];
    const after = candidate.paths[path];
    for (const key of keys(before, after)) {
      if (methods.has(key) && !own(before, key)) continue; // new operation only
      if (!own(after, key) && methods.has(key)) removed(`${at}/${pointer(key)}`);
      else if (!equal(before[key], after[key])) changed(`${at}/${pointer(key)}`);
    }
  }
  for (const group of keys(previous.components, candidate.components)) {
    if (!componentGroups.has(group)) {
      if (!equal(previous.components?.[group], candidate.components?.[group]))
        changed(`#/components/${pointer(group)}`);
      continue;
    }
    const before = previous.components?.[group] ?? {};
    const after = candidate.components?.[group] ?? {};
    // New reusable declarations are allowed. Every previous declaration, even an
    // apparently unused one, must remain; references can be indirect or external.
    for (const name of Object.keys(before).sort()) {
      const at = `#/components/${pointer(group)}/${pointer(name)}`;
      if (!own(after, name)) removed(at);
      else if (!equal(before[name], after[name])) changed(at);
    }
  }
  const diff = diffOpenApiDocuments(previous, candidate);
  return {
    compatible: findings.length === 0,
    status: findings.some(({ kind }) => kind === 'removed')
      ? 'incompatible'
      : findings.length > 0
        ? 'unproven'
        : 'compatible',
    findings,
    diff,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) {
    console.error('Usage: bun scripts/contracts/compatibility.mjs <released.json> <candidate.json>');
    process.exitCode = 2;
  } else {
    try {
      const previous = JSON.parse(await readFile(process.argv[2], 'utf8'));
      const candidate = JSON.parse(await readFile(process.argv[3], 'utf8'));
      const result = await checkContractCompatibility(previous, candidate);
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.compatible ? 0 : 1;
    } catch {
      // A malformed/unavailable baseline is never "initial publication success".
      // Suppress parser/source messages: they may contain example credentials.
      console.error('Contract compatibility failed: two valid, readable OpenAPI 3.1 documents are required.');
      process.exitCode = 2;
    }
  }
}
