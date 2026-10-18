// Run with Bun: zopia's public entry point ships TypeScript and its CLI also requires Bun.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { zodToJsonSchema } from 'zopia';
import {
  adminAuditQuerySchema,
  adminRoleAssignmentSchema,
  adminStateSchema,
  adminUsersQuerySchema,
  loginSchema,
  securityReportSchema,
} from '../../../packages/validation/src/auth.ts';
import { utcInstantSchema, utcDateSchema } from '../../../packages/validation/src/time.ts';
import { findExecutableValidation, projectSchema } from '../schema.mjs';

// Resolve the tools' existing Zod peer; do not depend on hoisting or add another version.
const require = createRequire(realpathSync(new URL('../../../node_modules/zopia/package.json', import.meta.url)));
const { z } = require('zod');

const cases = [
  ['query canonicalisation', adminUsersQuerySchema, 'pipe'],
  ['cross-field timestamp ordering', adminAuditQuerySchema, 'custom'],
  ['trimmed, control-free administrative reason', adminStateSchema, 'overwrite'],
  ['trimmed report text', securityReportSchema, 'pipe'],
];
for (const [name, schema, kind] of cases) {
  assert(
    findExecutableValidation(schema).some((finding) => finding.kind === kind),
    name,
  );
  assert.throws(() => projectSchema(schema), /would lose executable validation/, name);
}

// Reproduce the silent-loss bug without relying on a hypothetical schema or a warning.
const warnings = [];
const legacyRoleAssignment = z.strictObject({
  currentPassword: z.string().max(1024),
  roleIds: z
    .array(z.uuidv7())
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length),
});
const projected = zodToJsonSchema(legacyRoleAssignment, {
  io: 'input',
  onWarning: (warning) => warnings.push(warning),
});
const id = '01900000-0000-7000-8000-000000000001';
assert.equal(legacyRoleAssignment.safeParse({ currentPassword: 'example', roleIds: [id, id] }).success, false);
assert.deepEqual(findExecutableValidation(adminRoleAssignmentSchema), []);
assert.equal(projectSchema(adminRoleAssignmentSchema).properties.roleIds.uniqueItems, true);
assert.equal(projected.properties.roleIds.uniqueItems, undefined);
assert.deepEqual(warnings, []);

// Calendar semantics are now represented natively rather than hidden in a refinement.
assert.deepEqual(findExecutableValidation(utcInstantSchema), []);
assert.deepEqual(findExecutableValidation(utcDateSchema), []);
assert.doesNotThrow(() => projectSchema(utcInstantSchema));
assert.doesNotThrow(() => projectSchema(utcDateSchema));

// Lossless structural schemas still work; refusing refinements must not mask all projections.
assert.deepEqual(findExecutableValidation(loginSchema), []);
assert.deepEqual(projectSchema(loginSchema), {
  type: 'object',
  properties: {
    username: { type: 'string', minLength: 1, maxLength: 256 },
    password: { type: 'string', maxLength: 1024 },
  },
  required: ['username', 'password'],
  additionalProperties: false,
});
const plain = z.strictObject({
  value: z.string().nullable(),
  optional: z.string().optional(),
  count: z.number().int().min(1).max(10),
  choice: z.union([z.literal('yes'), z.literal('no')]),
});
const plainProjection = projectSchema(plain);
assert.deepEqual(plainProjection.required, ['value', 'count', 'choice']);
assert.equal(plainProjection.additionalProperties, false);
assert.deepEqual(plainProjection.properties.value.type, ['string', 'null']);
assert.equal(plainProjection.properties.count.minimum, 1);
assert.equal(plainProjection.properties.count.maximum, 10);
assert.deepEqual(projectSchema(z.string().default('example'), { io: 'output' }).default, 'example');
assert.throws(() => projectSchema(z.string(), { io: 'sideways' }), /Unsupported schema direction/);
assert.throws(() => projectSchema(z.void()), /Contract projection warnings/);
assert.throws(() => projectSchema(z.lazy(() => z.string())), /would lose executable validation/);
assert.throws(
  () => projectSchema(z.string().transform((value) => value.toLowerCase())),
  /would lose executable validation/,
);

// Shared/recursive graph traversal terminates and does not invoke user-supplied functions.
let invoked = false;
const custom = z.string().refine(() => {
  invoked = true;
  return true;
});
const shared = z.strictObject({ first: custom, second: custom });
assert.equal(findExecutableValidation(shared).filter((finding) => finding.kind === 'custom').length, 1);
assert.equal(invoked, false);
assert.deepEqual(findExecutableValidation(null), []);
console.log(
  'executable-validation fidelity: 4 real auth regressions and portable calendar/uniqueness boundaries passed',
);
