// Actual role/permission schemas: old runtime, projected JSON Schema and generated Zod agree.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';
import { apiDocsToOpenApi, diffOpenApiDocuments, openApiToApiDocs, validateZopia } from 'zopia';
import {
  adminRoleAssignmentSchema,
  adminRoleCreateSchema,
  adminRoleUpdateSchema,
} from '../../../packages/validation/src/auth.ts';
import { uniqueStringItemsCheck } from '../../../packages/validation/src/unique-strings.ts';
import { findExecutableValidation, projectSchema } from '../schema.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const requireTool = createRequire(await realpath(join(root, 'node_modules/zopia/package.json')));
const { z } = requireTool('zod');
const requireValidator = createRequire(
  await realpath(join(root, 'node_modules/@apidevtools/swagger-parser/package.json')),
);
const { default: Ajv2020 } = requireValidator('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true });
const schemas = {
  RoleAssignment: adminRoleAssignmentSchema,
  RoleCreate: adminRoleCreateSchema,
  RoleUpdate: adminRoleUpdateSchema,
};
const oldRoles = z
  .array(z.uuidv7())
  .max(20)
  .refine((ids) => new Set(ids).size === ids.length);
const oldPermissions = z
  .array(z.string().regex(/^[a-z]+\.[a-z]+$/))
  .max(50)
  .refine((keys) => new Set(keys).size === keys.length);
const oldSchemas = {
  RoleAssignment: adminRoleAssignmentSchema.extend({ roleIds: oldRoles }),
  RoleCreate: adminRoleCreateSchema.extend({ permissions: oldPermissions }),
  RoleUpdate: adminRoleUpdateSchema.extend({ permissions: oldPermissions }),
};
const spec = {
  openapi: '3.1.0',
  info: { title: 'Portable role uniqueness fixture', version: '1.0.0' },
  paths: {},
  components: { schemas: {} },
};
for (const [name, schema] of Object.entries(schemas)) {
  assert.deepEqual(findExecutableValidation(schema), []);
  const projected = projectSchema(schema);
  assert.deepEqual(projectSchema(schema, { io: 'output' }), projected);
  spec.components.schemas[name] = projected;
  spec.paths[`/${name}`] = {
    post: {
      operationId: name,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}` } } },
      },
      responses: {
        200: {
          description: 'Validated fixture',
          content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}` } } },
        },
      },
    },
  };
}
// Metadata is not a bypass for arbitrary checks, absent declarations, or non-string arrays.
for (const schema of [
  z.array(z.string()).check(uniqueStringItemsCheck),
  z.array(z.string()).check(uniqueStringItemsCheck).meta({ uniqueItems: false }),
  z.array(z.string()).check(uniqueStringItemsCheck).meta({ uniqueItems: true, maxItems: 1 }),
  z
    .array(z.string())
    .refine(() => false)
    .meta({ uniqueItems: true }),
  z.array(z.number()).check(uniqueStringItemsCheck).meta({ uniqueItems: true }),
  adminRoleAssignmentSchema.shape.roleIds.refine(() => false),
  adminRoleAssignmentSchema.shape.roleIds.refine(() => false).meta({ uniqueItems: true }),
])
  assert.throws(() => projectSchema(schema), /would lose executable validation/);
assert.equal(projectSchema(adminRoleAssignmentSchema.shape.roleIds).uniqueItems, true);
await mkdir(join(root, 'tmp'), { recursive: true });
const directory = await mkdtemp(join(root, 'tmp', 'portable-uniqueness-'));
try {
  await SwaggerParser.validate(structuredClone(spec), { resolve: { http: false, file: false } });
  const generated = await openApiToApiDocs(spec, {
    outDir: directory,
    mode: 'directory',
    insertComponents: true,
    useComponentAsReference: true,
    manifest: true,
  });
  assert.deepEqual(
    generated.warnings.map(({ code, at }) => ({ code, at })),
    Object.keys(schemas).map((name) => ({
      code: 'ZOPIA_WARN_UNIQUE_ITEMS',
      at: `#/components/schemas/${name}/properties/${name === 'RoleAssignment' ? 'roleIds' : 'permissions'}`,
    })),
  );
  assert(generated.manifestPath);
  await mkdir(join(directory, 'node_modules'));
  for (const name of ['zod', 'km-api'])
    await symlink(dirname(requireTool.resolve(`${name}/package.json`)), join(directory, 'node_modules', name), 'dir');
  const reversed = await apiDocsToOpenApi(directory, { version: '3.1' });
  assert.deepEqual(reversed.warnings, []);
  assert.equal(diffOpenApiDocuments(spec, reversed.openapi).identical, true);
  await SwaggerParser.validate(structuredClone(reversed.openapi), { resolve: { http: false, file: false } });
  const validation = await validateZopia(directory, { kind: 'docs' });
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.diagnostics, []);
  const manifest = JSON.parse(await readFile(join(directory, generated.manifestPath), 'utf8'));
  const id = (index) => `019abcde-abcd-7abc-8abc-${index.toString(16).padStart(12, '0')}`;
  const ids = Array.from({ length: 21 }, (_, index) => id(index));
  const keys = Array.from(
    { length: 51 },
    (_, index) => `users.${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + (index % 26))}`,
  );
  for (const [name, schema] of Object.entries(schemas)) {
    const api = manifest.apis.find((api) => api.operationId === name);
    assert(api);
    const endpoint = (await import(pathToFileURL(join(directory, api.file)).href)).default;
    const jsonValidate = ajv.compile(spec.components.schemas[name]);
    const base =
      name === 'RoleAssignment'
        ? { currentPassword: 'invented' }
        : {
            currentPassword: 'invented',
            ...(name === 'RoleCreate' ? { key: 'example_role' } : {}),
            nameKey: 'roles.example',
          };
    const field = name === 'RoleAssignment' ? 'roleIds' : 'permissions';
    const values =
      name === 'RoleAssignment'
        ? [
            [],
            [id(0)],
            ids.slice(0, 20),
            ids,
            [id(0), id(0)],
            [id(0), id(0).toUpperCase()],
            ['019abcde-abcd-4abc-8abc-000000000000'],
            [id(0) + '\n'],
            ['invalid'],
            [null],
            [1],
            null,
          ]
        : [
            [],
            [keys[0]],
            keys.slice(0, 50),
            keys,
            [keys[0], keys[0]],
            ['users.Read'],
            ['users.read\n'],
            ['invalid'],
            [null],
            [1],
            null,
          ];
    const bodies = [
      { ...base },
      ...values.flatMap((value) => [
        { ...base, [field]: value },
        { ...base, [field]: value, extra: true },
      ]),
    ];
    for (const body of bodies) {
      const expected = oldSchemas[name].safeParse(body);
      for (const candidate of [schema, endpoint.request.body, endpoint.response[200]]) {
        const result = candidate.safeParse(body);
        assert.equal(result.success, expected.success, `${name}: ${JSON.stringify(body)}`);
        if (result.success) assert.deepEqual(result.data, expected.data);
      }
      assert.equal(jsonValidate(body), expected.success, `${name}: JSON Schema ${JSON.stringify(body)}`);
    }
  }
  console.log('portable uniqueness: original/JSON Schema/generated validation and exact manifest round trip passed');
} finally {
  await rm(directory, { recursive: true, force: true });
}
