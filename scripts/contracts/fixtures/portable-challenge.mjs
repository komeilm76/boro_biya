// Verify the actual challenge response against its previous discriminated union.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises';
import SwaggerParser from '@apidevtools/swagger-parser';
import { apiDocsToOpenApi, diffOpenApiDocuments, openApiToApiDocs, validateZopia } from 'zopia';
import { challengeResponseSchema } from '../../../packages/validation/src/auth.ts';
import { utcInstantSchema } from '../../../packages/validation/src/time.ts';
import { findExecutableValidation, projectSchema } from '../schema.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const requireTool = createRequire(await realpath(join(root, 'node_modules/zopia/package.json')));
const { z } = requireTool('zod');
const requireValidator = createRequire(
  await realpath(join(root, 'node_modules/@apidevtools/swagger-parser/package.json')),
);
const { default: Ajv2020 } = requireValidator('ajv/dist/2020.js');
const source = challengeResponseSchema;
const old = z.discriminatedUnion('required', [
  z.strictObject({ required: z.literal(false) }),
  z.strictObject({
    required: z.literal(true),
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    bits: z.number().int().min(12).max(20),
    expiresAt: utcInstantSchema,
  }),
]);
assert.deepEqual(findExecutableValidation(source), []);
assert.throws(() => projectSchema(old), /discriminated_union/);
const projection = projectSchema(source);
assert.deepEqual(projectSchema(source, { io: 'output' }), projection);
const validate = new Ajv2020({ strict: true }).compile(projection);
const spec = {
  openapi: '3.1.0',
  info: { title: 'Portable challenge union fidelity fixture', version: '1.0.0' },
  paths: {
    '/fixture': {
      post: {
        operationId: 'portableChallenge',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Challenge' } } },
        },
        responses: {
          200: {
            description: 'Challenge requirement',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Challenge' } } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Challenge: projection,
    },
  },
};
await mkdir(join(root, 'tmp'), { recursive: true });
const directory = await mkdtemp(join(root, 'tmp', 'portable-challenge-fidelity-'));
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
    [{ code: 'ZOPIA_WARN_FROZEN_SUBTREE', at: '#/components/schemas/Challenge/anyOf/1/properties/expiresAt' }],
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
  const endpoint = await import(pathToFileURL(join(directory, manifest.apis[0].file)).href);
  const roundTripped = endpoint.default.response[200];
  const roundTrippedRequest = endpoint.default.request.body;
  const valid = { required: true, token: 'N'.repeat(43), bits: 14, expiresAt: '2026-10-17T12:00:00Z' };
  const bodies = [
    null,
    false,
    true,
    {},
    [],
    { required: false },
    { ...valid },
    { ...valid, extra: true },
    { required: false, token: valid.token },
  ];
  for (const field of Object.keys(valid)) {
    const missing = { ...valid };
    delete missing[field];
    bodies.push(missing);
    for (const value of [
      null,
      undefined,
      '',
      0,
      false,
      true,
      {},
      [],
      'false',
      'true',
      11,
      12,
      20,
      21,
      12.5,
      'N'.repeat(42),
      'N'.repeat(44),
      '2025-02-29T12:00:00Z',
      '2024-02-29T12:00:00Z',
    ])
      bodies.push({ ...valid, [field]: value });
  }
  for (const body of bodies) {
    const expected = old.safeParse(body);
    for (const schema of [source, roundTripped, roundTrippedRequest]) {
      const result = schema.safeParse(body);
      assert.equal(result.success, expected.success);
      if (result.success) assert.deepEqual(result.data, expected.data);
    }
    assert.equal(validate(body), expected.success);
  }
  console.log(
    'portable challenge union: original/JSON Schema/generated validation and exact manifest round trip passed',
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
