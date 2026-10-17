// Verify actual authentication identifier schemas against the previous UUIDv7 validator.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises';
import SwaggerParser from '@apidevtools/swagger-parser';
import { apiDocsToOpenApi, diffOpenApiDocuments, openApiToApiDocs, validateZopia } from 'zopia';
import { uuidV7Schema } from '../../../packages/validation/src/uuid.ts';
import {
  adminIdSchema,
  adminCursorSchema,
  adminRolesResponseSchema,
  adminUserResponseSchema,
} from '../../../packages/validation/src/auth.ts';
import { findExecutableValidation, projectSchema } from '../schema.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const requireTool = createRequire(await realpath(join(root, 'node_modules/zopia/package.json')));
const { z } = requireTool('zod');
const requireValidator = createRequire(
  await realpath(join(root, 'node_modules/@apidevtools/swagger-parser/package.json')),
);
const { default: Ajv2020 } = requireValidator('ajv/dist/2020.js');
const source = z.strictObject({
  id: adminIdSchema.shape.id,
  cursor: adminCursorSchema.shape.cursor,
  nextCursor: adminRolesResponseSchema.shape.nextCursor,
  roleIds: adminUserResponseSchema.shape.roleIds,
});
const old = z.strictObject({
  id: z.uuidv7(),
  cursor: z.uuidv7().optional(),
  nextCursor: z.uuidv7().nullable(),
  roleIds: z.array(z.uuidv7()),
});
assert.equal(adminIdSchema.shape.id, uuidV7Schema);
assert.deepEqual(findExecutableValidation(uuidV7Schema), []);
assert.throws(() => projectSchema(z.uuidv7()), /versioned_uuid/);
assert.throws(() => projectSchema(z.strictObject({ id: z.uuidv7().optional() })), /versioned_uuid/);
const projection = projectSchema(source);
assert.deepEqual(projectSchema(source, { io: 'output' }), projection);
const validate = new Ajv2020({ strict: true }).compile(projection);
const spec = {
  openapi: '3.1.0',
  info: { title: 'Portable UUIDv7 fidelity fixture', version: '1.0.0' },
  paths: {
    '/fixture': {
      post: {
        operationId: 'portableUuid',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Identity' } } },
        },
        responses: {
          200: {
            description: 'UUIDv7 values',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Identity' } } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Identity: projection,
    },
  },
};
await mkdir(join(root, 'tmp'), { recursive: true });
const directory = await mkdtemp(join(root, 'tmp', 'portable-uuid-fidelity-'));
try {
  await SwaggerParser.validate(structuredClone(spec), { resolve: { http: false, file: false } });
  const generated = await openApiToApiDocs(spec, {
    outDir: directory,
    mode: 'directory',
    insertComponents: true,
    useComponentAsReference: true,
    manifest: true,
  });
  assert.deepEqual(generated.warnings, []);
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
  const endpoint = await import(pathToFileURL(join(directory, manifest.apis[0].file)).href);
  const roundTripped = endpoint.default.response[200];
  const roundTrippedRequest = endpoint.default.request.body;
  const id = '019abcde-abcd-7abc-8abc-0123456789ab';
  const values = [
    id,
    id.toUpperCase(),
    '',
    id + '\n',
    id + ' ',
    id.slice(1),
    null,
    1,
    {},
    '00000000-0000-0000-0000-000000000000',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
  ];
  for (const version of '0123456789abcdef')
    for (const variant of '0123456789abcdef')
      values.push(id.slice(0, 14) + version + id.slice(15, 19) + variant + id.slice(20));
  for (const value of values) {
    for (const body of [
      { id: value, nextCursor: null, roleIds: [] },
      { id, cursor: value, nextCursor: null, roleIds: [] },
      { id, nextCursor: value, roleIds: [] },
      { id, nextCursor: null, roleIds: [value] },
      { id: value, nextCursor: null, roleIds: [], extra: true },
    ]) {
      const expected = old.safeParse(body);
      for (const schema of [source, roundTripped, roundTrippedRequest]) {
        const result = schema.safeParse(body);
        assert.equal(result.success, expected.success, JSON.stringify(body));
        if (result.success) assert.deepEqual(result.data, expected.data);
      }
      assert.equal(validate(body), expected.success, JSON.stringify(body));
    }
  }
  console.log('portable UUIDv7: original/JSON Schema/generated validation and exact manifest round trip passed');
} finally {
  await rm(directory, { recursive: true, force: true });
}
