// API-08 / API-30: fail closed before a Zod projection can hide executable validation.
// Tooling only: this module is never imported by a browser or the production API.
import { zodToJsonSchema } from 'zopia';
import { CONTRACT_RULES, contractRuleRegistration } from '../../packages/validation/src/contract-rules.ts';
import { uniqueStringItemsCheck } from '../../packages/validation/src/unique-strings.ts';

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
    const registration = contractRuleRegistration(value);
    if (registration) {
      visit(registration.base, at);
      return;
    }
    const definition = value._zod?.def;
    if (definition !== undefined) {
      const kind = definition.type ?? definition.check;
      if (['custom', 'overwrite', 'transform', 'pipe', 'lazy'].includes(kind)) {
        findings.push({ at, kind });
      }
      // The pinned reverse converter changes oneOf/discriminator structure. Refuse that
      // known-loss path; disjoint plain unions have an exact anyOf round trip.
      if (definition.type === 'union' && definition.discriminator !== undefined) {
        findings.push({ at, kind: 'discriminated_union' });
      }
      // The pinned converter drops the UUID version pattern while retaining generic uuid.
      // Refuse that silent widening; explicit regex-based UUID schemas remain portable.
      if (definition.type === 'string' && definition.format === 'uuid' && definition.version !== undefined) {
        findings.push({ at, kind: 'versioned_uuid' });
      }
      // This exact string-array check has a faithful JSON Schema keyword. Metadata alone
      // never authorises a refinement: require check identity, array/string shape and only
      // the matching declaration. Any additional executable check still fails closed.
      const metadata = typeof value.meta === 'function' ? value.meta() : undefined;
      if (metadata?.[CONTRACT_RULES] !== undefined) findings.push({ at, kind: 'unowned_contract_rules' });
      const portableUniqueStrings =
        definition.type === 'array' &&
        definition.element?._zod?.def.type === 'string' &&
        metadata?.uniqueItems === true &&
        Object.keys(metadata).length === 1;
      for (const [key, child] of Object.entries(definition)) {
        if (key === 'checks' && portableUniqueStrings && Array.isArray(child)) {
          child.forEach((check, index) => {
            if (check !== uniqueStringItemsCheck) visit(check, `${at}/checks/${index}`);
          });
        } else visit(child, `${at}/${pointer(key)}`);
      }
      return;
    }
    for (const [key, child] of Object.entries(value)) visit(child, `${at}/${pointer(key)}`);
  }
  visit(schema, '#');
  return findings;
}

/** Project portable structure or exact compiler-owned rules; never discard unknown execution. */
export function projectSchema(schema, { io = 'input' } = {}) {
  if (io !== 'input' && io !== 'output') throw new Error(`Unsupported schema direction: ${io}`);
  const findings = findExecutableValidation(schema);
  if (findings.length !== 0) {
    throw new Error(`Contract projection would lose executable validation: ${JSON.stringify(findings)}`);
  }
  const warnings = [];
  const prepare = (value) => {
    if (value === null || typeof value !== 'object') return value;
    const registration = contractRuleRegistration(value);
    if (registration)
      return prepare(registration.base).meta({ ...registration.base.meta(), [CONTRACT_RULES]: registration.rules });
    if (value._zod?.def?.type && typeof value.clone === 'function') {
      const cloned = value.clone(prepare(value._zod.def)).meta(value.meta() ?? {});
      // Zod's default object parser strips unknown keys; plain JSON Schema and the
      // native generator otherwise preserve them. Declare that output behaviour.
      if (value._zod.def.type === 'object' && value._zod.def.catchall === undefined)
        return cloned.meta({
          ...value.meta(),
          additionalProperties: true,
          [CONTRACT_RULES]: { version: 1, kind: 'strip-unknown' },
        });
      return cloned;
    }
    if (Array.isArray(value)) return value.map(prepare);
    if (Object.getPrototypeOf(value) === Object.prototype)
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, prepare(child)]));
    return value;
  };
  const result = zodToJsonSchema(prepare(schema), {
    target: 'openapi-3.1',
    $schema: false,
    io,
    onWarning: (warning) => warnings.push(warning),
  });
  if (warnings.length !== 0) throw new Error(`Contract projection warnings: ${JSON.stringify(warnings)}`);
  return result;
}
