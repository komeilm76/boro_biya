// API-08 / API-30: fail closed before a Zod projection can hide executable validation.
// Tooling only: this module is never imported by a browser or the production API.
import { zodToJsonSchema } from 'zopia';

const pointer = (part) => String(part).replaceAll('~', '~0').replaceAll('/', '~1');

/**
 * Zod core exposes schema/check definitions through `_zod.def`. Inspect definitions, not
 * function source, and never run a transform/refinement while describing a contract.
 * The pinned-version fixtures exercise this boundary whenever the tooling changes.
 */
export function findExecutableValidation(schema) {
  const seen = new WeakSet();
  const findings = [];
  function visit(value, at) {
    if (value === null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    const definition = value._zod?.def;
    if (definition !== undefined) {
      const kind = definition.type ?? definition.check;
      if (['custom', 'overwrite', 'transform', 'pipe', 'lazy'].includes(kind)) {
        findings.push({ at, kind });
      }
      visit(definition, at);
      return;
    }
    for (const [key, child] of Object.entries(value)) visit(child, `${at}/${pointer(key)}`);
  }
  visit(schema, '#');
  return findings;
}

/** Project only schemas whose validation can be represented without executable Zod checks. */
export function projectSchema(schema, { io = 'input' } = {}) {
  if (io !== 'input' && io !== 'output') throw new Error(`Unsupported schema direction: ${io}`);
  const findings = findExecutableValidation(schema);
  if (findings.length !== 0) {
    throw new Error(`Contract projection would lose executable validation: ${JSON.stringify(findings)}`);
  }
  const warnings = [];
  const result = zodToJsonSchema(schema, {
    target: 'openapi-3.1',
    $schema: false,
    io,
    onWarning: (warning) => warnings.push(warning),
  });
  if (warnings.length !== 0) throw new Error(`Contract projection warnings: ${JSON.stringify(warnings)}`);
  return result;
}
