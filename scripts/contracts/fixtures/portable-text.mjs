// Verify the actual post-trim content schemas, not the still-unrepresentable trim step.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises';
import SwaggerParser from '@apidevtools/swagger-parser';
import { apiDocsToOpenApi, diffOpenApiDocuments, openApiToApiDocs, validateZopia } from 'zopia';
import {
  administrativeReasonContentSchema,
  securityReportContentSchema,
} from '../../../packages/validation/src/text-content.ts';
import { findExecutableValidation, projectSchema } from '../schema.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const requireTool = createRequire(await realpath(join(root, 'node_modules/zopia/package.json')));
const { z } = requireTool('zod');
const requireValidator = createRequire(
  await realpath(join(root, 'node_modules/@apidevtools/swagger-parser/package.json')),
);
const { default: Ajv2020 } = requireValidator('ajv/dist/2020.js');
const source = z.strictObject({ reason: administrativeReasonContentSchema, message: securityReportContentSchema });
const old = z.strictObject({
  reason: z
    .string()
    .min(1)
    .max(500)
    .refine((value) => !/\p{Cc}/u.test(value)),
  message: z
    .string()
    .min(20)
    .max(4000)
    .refine((value) => Array.from(value).length >= 20)
    .refine((value) =>
      Array.from(value).every((character) => {
        const code = character.codePointAt(0);
        return code !== 127 && (code >= 32 || [9, 10, 13].includes(code));
      }),
    ),
});
assert.deepEqual(findExecutableValidation(source), []);
const projection = projectSchema(source);
assert.deepEqual(projectSchema(source, { io: 'output' }), projection);
const validate = new Ajv2020({ strict: true }).compile(projection);
const spec = {
  openapi: '3.1.0',
  info: { title: 'Portable text content fidelity fixture', version: '1.0.0' },
  paths: {
    '/fixture': {
      post: {
        operationId: 'portableText',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Content' } } },
        },
        responses: {
          200: {
            description: 'Post-trim content',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Content' } } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Content: projection,
    },
  },
};
await mkdir(join(root, 'tmp'), { recursive: true });
const directory = await mkdtemp(join(root, 'tmp', 'portable-text-fidelity-'));
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
  const valid = {
    reason: 'An invented administrative reason',
    message: 'An invented report without private information.',
  };
  const bodies = [null, {}, [], { ...valid }, { ...valid, extra: true }];
  const values = [
    null,
    undefined,
    0,
    false,
    {},
    [],
    '',
    ' ',
    'x'.repeat(19),
    'x'.repeat(20),
    'x'.repeat(500),
    'x'.repeat(501),
    'x'.repeat(4000),
    'x'.repeat(4001),
    '😀'.repeat(19),
    '😀'.repeat(20),
    '😀'.repeat(500),
    '😀'.repeat(501),
    '😀'.repeat(4000),
    '😀'.repeat(4001),
    'متن آزمایشی بدون اطلاعات واقعی',
  ];
  for (let code = 0; code <= 0x9f; code++) {
    const ch = String.fromCharCode(code);
    values.push(ch + valid.message, valid.message + ch, valid.message + ch + ' details');
  }
  for (const value of values) for (const field of ['reason', 'message']) bodies.push({ ...valid, [field]: value });
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
    'portable text: prior/runtime/JSON Schema/generated content validation and exact manifest round trip passed',
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
