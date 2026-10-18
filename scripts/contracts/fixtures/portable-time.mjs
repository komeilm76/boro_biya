// Verify the real wire schemas, not a separately maintained calendar pattern.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises';
import SwaggerParser from '@apidevtools/swagger-parser';
import { apiDocsToOpenApi, diffOpenApiDocuments, openApiToApiDocs, validateZopia } from 'zopia';
import { utcDateSchema, utcInstantSchema } from '../../../packages/validation/src/time.ts';
import { projectSchema } from '../schema.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const instant = projectSchema(utcInstantSchema);
const date = projectSchema(utcDateSchema);
assert.deepEqual(projectSchema(utcInstantSchema, { io: 'output' }), instant);
assert.deepEqual(projectSchema(utcDateSchema, { io: 'output' }), date);
// Use the validator's existing locked Ajv 2020 dependency, not a new package/version.
const requireValidator = createRequire(
  await realpath(join(root, 'node_modules/@apidevtools/swagger-parser/package.json')),
);
const { default: Ajv2020 } = requireValidator('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true });
const validateInstant = ajv.compile(instant);
const validateDate = ajv.compile(date);
const spec = {
  openapi: '3.1.0',
  info: { title: 'Portable UTC fidelity fixture', version: '1.0.0' },
  paths: {
    '/fixture': {
      post: {
        operationId: 'portableUtc',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Time' } } },
        },
        responses: {
          200: {
            description: 'UTC calendar values',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Time' } } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Time: {
        type: 'object',
        additionalProperties: false,
        required: ['instant', 'date'],
        properties: { instant, date },
      },
    },
  },
};
await mkdir(join(root, 'tmp'), { recursive: true });
const directory = await mkdtemp(join(root, 'tmp', 'portable-utc-fidelity-'));
try {
  await SwaggerParser.validate(structuredClone(spec), { resolve: { http: false, file: false } });
  const generated = await openApiToApiDocs(spec, {
    outDir: directory,
    mode: 'directory',
    insertComponents: true,
    useComponentAsReference: true,
    manifest: true,
  });
  // Frozen intersections are exact metadata overlays here. Assert the diagnostics and then
  // prove both runtime acceptance and document equality; this is not a publication exception.
  assert.deepEqual(
    generated.warnings.map(({ code, at }) => ({ code, at })),
    [
      { code: 'ZOPIA_WARN_FROZEN_SUBTREE', at: '#/components/schemas/Time/properties/date' },
      { code: 'ZOPIA_WARN_FROZEN_SUBTREE', at: '#/components/schemas/Time/properties/instant' },
    ],
  );
  assert(generated.manifestPath);
  const requireTool = createRequire(await realpath(join(root, 'node_modules/zopia/package.json')));
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
  for (let year = 0; year <= 9999; year++) {
    const value = `${String(year).padStart(4, '0')}-02-29`;
    assert.equal(validateDate(value), utcDateSchema.safeParse(value).success, value);
    assert.equal(
      validateInstant(`${value}T00:00:00Z`),
      utcInstantSchema.safeParse(`${value}T00:00:00Z`).success,
      value,
    );
  }
  for (const date of [
    '0000-02-29',
    '1900-02-29',
    '2000-02-29',
    '2026-02-28',
    '2026-02-30',
    '2026-04-31',
    '9999-12-31',
  ]) {
    for (const suffix of [
      'T00:00:00Z',
      'T23:59:59.123456789Z',
      'T24:00:00Z',
      'T00:00Z',
      'T00:00:00.1234567890Z',
      'T00:00:00+00:00',
    ]) {
      const instant = date + suffix;
      const accepted = utcDateSchema.safeParse(date).success && utcInstantSchema.safeParse(instant).success;
      for (const schema of [roundTripped, roundTrippedRequest]) {
        assert.equal(schema.safeParse({ instant, date }).success, accepted, instant);
        assert.equal(schema.safeParse({ instant, date, extra: true }).success, false);
      }
    }
  }
  console.log('portable UTC fidelity: runtime/JSON Schema equivalence and exact manifest round trip passed');
} finally {
  await rm(directory, { recursive: true, force: true });
}
