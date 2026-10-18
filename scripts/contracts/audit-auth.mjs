// Run: bun --tsconfig-override tsconfig.base.json scripts/contracts/audit-auth.mjs
// A publication preflight, not a published contract or a proof from schema shape alone.
import { authOperations } from '../../packages/contracts/src/auth.ts';
import { absentBodySchema } from '../../packages/validation/src/auth.ts';
import { findExecutableValidation, projectSchema } from './schema.mjs';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const requireValidator = createRequire(
  realpathSync(new URL('../../node_modules/@apidevtools/swagger-parser/package.json', import.meta.url)),
);
const { default: Ajv2020 } = requireValidator('ajv/dist/2020.js');
const validator = new Ajv2020({ strict: true });
const pointer = (part) => String(part).replaceAll('~', '~0').replaceAll('/', '~1');

/** A bounded concrete counterexample check, never an assertion of general equivalence. */
function plainStringLengthDrift(schema) {
  const definition = schema?._zod?.def;
  if (definition?.type !== 'string') return false;
  const checks = definition.checks ?? [];
  // Only plain built-in length checks: never execute user refinements/transforms.
  if (checks.length === 0 || checks.some((check) => !['min_length', 'max_length'].includes(check._zod?.def.check)))
    return false;
  const bounds = checks.map((check) => check._zod.def.minimum ?? check._zod.def.maximum);
  if (bounds.some((bound) => !Number.isSafeInteger(bound) || bound < 0 || bound > 4096)) return false;
  const projected = validator.compile(projectSchema(schema));
  const lengths = new Set(
    bounds.flatMap((bound) => [Math.max(0, Math.ceil(bound / 2)), Math.floor(bound / 2) + 1, bound]),
  );
  for (const length of lengths) {
    const value = '\u{1f600}'.repeat(length);
    if (schema.safeParse(value).success !== projected(value)) return true;
  }
  return false;
}

export function auditAuthContracts() {
  const blockers = [];
  let schemas = 0;
  for (const [name, operation] of Object.entries(authOperations)) {
    const locations = [
      ...Object.entries(operation.spec.request).map(([key, schema]) => [`request/${key}`, schema, 'input']),
      ...Object.entries(operation.spec.response).map(([key, schema]) => [`response/${key}`, schema, 'output']),
    ];
    for (const [location, schema, io] of locations) {
      if (schema === absentBodySchema) continue; // no JSON content, not a weak projection
      schemas++;
      const at = `${name}/${location}`;
      const findings = findExecutableValidation(schema);
      if (findings.length > 0) blockers.push({ at, kind: 'executable-validation', findings });
      else {
        try {
          projectSchema(schema, { io });
        } catch {
          blockers.push({ at, kind: 'projection-failure' });
        }
      }
      const seen = new WeakSet();
      const visit = (node, path) => {
        if (node === null || typeof node !== 'object' || seen.has(node)) return;
        seen.add(node);
        if (plainStringLengthDrift(node)) blockers.push({ at: `${at}${path}`, kind: 'utf16-codepoint-length' });
        const definition = node._zod?.def;
        if (definition) {
          for (const [key, child] of Object.entries(definition)) visit(child, `${path}/${pointer(key)}`);
        } else if (Array.isArray(node) || Object.getPrototypeOf(node) === Object.prototype) {
          for (const [key, child] of Object.entries(node)) visit(child, `${path}/${pointer(key)}`);
        }
      };
      visit(schema, '#');
    }
  }
  return {
    operations: Object.keys(authOperations).length,
    schemas,
    readyForPublication: blockers.length === 0,
    blockers,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = auditAuthContracts();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.readyForPublication ? 0 : 1;
}
