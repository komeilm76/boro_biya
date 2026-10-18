// Actual committed native tree, canonical schemas and strict profile-aware Ajv.
// Acceptance is checked separately from parsed output; Ajv does not transform data.
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applicationDirectory, root } from '../application.mjs';
import { authOperations } from '../../../packages/contracts/src/auth.ts';
import * as v from '../../../packages/validation/src/index.ts';
import { bodies, responses } from './auth-examples.mjs';
import { projectSchema } from '../schema.mjs';
const requireTool = createRequire(await realpath(join(root, 'node_modules/zopia/package.json')));
const requireValidator = createRequire(
  await realpath(join(root, 'node_modules/@apidevtools/swagger-parser/package.json')),
);
const { default: Ajv2020 } = requireValidator('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true });
ajv.addKeyword({ keyword: v.CONTRACT_RULES, schemaType: 'object', compile: v.compileContractAssertion, errors: false });
const document = JSON.parse(await readFile(join(applicationDirectory, 'openapi.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(applicationDirectory, '.zopia-manifest.json'), 'utf8'));
const directory = await mkdtemp(join(dirname(applicationDirectory), '.auth-semantics-'));
const id = '01900000-0000-7000-8000-000000000001';
const outcome = (schema, value) => {
  const result = schema.safeParse(value);
  return result.success ? { success: true, data: result.data } : { success: false };
};
let comparisons = 0;
function compare(source, native, values, projected = projectSchema(source)) {
  const validate = ajv.compile(projected);
  for (const value of values) {
    const expected = outcome(source, value);
    assert.deepEqual(outcome(native, value), expected, `Native drift for ${JSON.stringify(value)}`);
    assert.equal(validate(value), expected.success, `Profile-aware JSON Schema drift: ${JSON.stringify(value)}`);
    comparisons++;
  }
}
try {
  await cp(applicationDirectory, directory, { recursive: true, filter: (path) => !path.includes('node_modules') });
  await mkdir(join(directory, 'node_modules'));
  for (const name of ['zod', 'km-api'])
    await symlink(dirname(requireTool.resolve(`${name}/package.json`)), join(directory, 'node_modules', name), 'dir');
  assert.equal(manifest.apis.length, 44);
  for (const [name, contract] of Object.entries(authOperations)) {
    const entry = manifest.apis.find(
      (entry) => entry.path === contract.spec.pathShape && entry.method === contract.spec.method.toLowerCase(),
    );
    assert(entry, name);
    const native = (await import(pathToFileURL(join(directory, entry.file)).href)).default;
    const operation = document.paths[entry.path][entry.method];
    const sourceBody = contract.spec.request.body;
    if (sourceBody === v.absentBodySchema) {
      assert.equal(operation['x-boro-no-request-body'], true);
      assert.equal(operation.requestBody, undefined);
      for (const value of [undefined, null, {}, [], 1, ''])
        assert.deepEqual(outcome(native.request.body, value), outcome(sourceBody, value));
    } else {
      assert(bodies.has(sourceBody), `Missing independent body fixture for ${name}`);
      compare(sourceBody, native.request.body, [
        bodies.get(sourceBody),
        undefined,
        null,
        {},
        [],
        { ...bodies.get(sourceBody), unexpected: true },
      ]);
      for (const field of ['reason', 'message'])
        if (field in bodies.get(sourceBody)) {
          const values = [null, undefined, '', ' ', ' x ', 'a\nb', 'a\tb', 'a\rb', '\u200d', '\ud800'];
          for (const bound of [19, 20, 500, 501, 4000, 4001])
            for (const character of ['x', '😀']) values.push(`  ${character.repeat(bound)}  `);
          for (let code = 0; code <= 159; code++)
            values.push('Invented bounded report ' + String.fromCharCode(code) + ' for testing');
          compare(
            sourceBody,
            native.request.body,
            values.map((value) => ({ ...bodies.get(sourceBody), [field]: value })),
          );
        }
    }
    for (const key of ['query', 'params']) {
      const source = contract.spec.request[key];
      const value = key === 'params' && 'id' in source.shape ? { id } : {};
      compare(
        source,
        native.request[key],
        [value, null, [], { ...value, unexpected: true }],
        operation[`x-boro-${key}-schema`] ?? projectSchema(source),
      );
    }
    for (const [status, source] of Object.entries(contract.spec.response)) {
      if (status === '204') {
        // HTTP 204 has no JSON value. The existing client transport uses null as its
        // sentinel; the native docs model uses undefined. Neither emits a JSON body.
        assert.equal(operation.responses[204].content, undefined);
        assert.equal(contract.success.parse(null), null);
        assert.equal(native.response[204].parse(undefined), undefined);
        continue;
      }
      const sample =
        Number(status) === contract.successStatus
          ? responses.get(source)
          : {
              code: 'safe_error',
              message: 'Invented safe diagnostic',
              requestId: id,
              details: [{ field: 'invented', issue: 'Safe invented issue', extra: true }],
            };
      assert(sample !== undefined, `Missing independent response fixture for ${name}/${status}`);
      const ref = operation.responses[status].content['application/json'].schema.$ref;
      const schema = document.components.schemas[ref.split('/').at(-1)];
      compare(
        source,
        native.response[status],
        [sample, null, {}, false, ...(Array.isArray(sample) ? [] : [{ ...sample, unexpected: true }])],
        schema,
      );
      if (!Array.isArray(sample) && 'reason' in sample)
        compare(
          source,
          native.response[status],
          [
            { ...sample, reason: 'Invented reason' },
            { ...sample, reason: 0 },
          ],
          schema,
        );
    }
    if (name === 'adminAssignRoles')
      compare(contract.spec.request.body, native.request.body, [
        { currentPassword: 'invented', roleIds: [id, id] },
        { currentPassword: 'invented', roleIds: [id] },
      ]);
    if (name === 'adminCreateRole')
      compare(contract.spec.request.body, native.request.body, [
        { ...bodies.get(contract.spec.request.body), permissions: ['users.read', 'users.read'] },
      ]);
    if (name === 'adminUsers') {
      const values = [
        null,
        0,
        '',
        ' ',
        ' ＡＬＩＣＥ ',
        'نام کاربر',
        'İ',
        'ﬃ'.repeat(22),
        'x'.repeat(64),
        'x'.repeat(65),
        'x'.repeat(257),
        '\u200d',
        'a\nb',
        '😀'.repeat(64),
        '😀'.repeat(65),
      ];
      compare(
        contract.spec.request.query,
        native.request.query,
        values.map((username) => ({ username })),
        operation['x-boro-query-schema'],
      );
      assert.equal(native.request.query.parse({ username: ' ＡＬＩＣＥ ' }).username, 'alice');
    }
    if (name === 'adminAudit') {
      const fractions = ['', '000', '000000001', '001', '001000001', '1', '100000000', '999999999'];
      const times = fractions.map((value) => `2026-10-17T12:00:00${value ? '.' + value : ''}Z`);
      const values = times.flatMap((from) => times.map((to) => ({ from, to })));
      values.push(
        { from: '2025-02-29T00:00:00Z' },
        { to: '2026-10-17T12:00:00.1234567890Z' },
        { from: times[0] },
        { to: times[0] },
      );
      compare(contract.spec.request.query, native.request.query, values, operation['x-boro-query-schema']);
    }
  }
  const stream = manifest.apis.find((entry) => entry.path === '/api/v1/streams/events');
  const nativeStream = (await import(pathToFileURL(join(directory, stream.file)).href)).default;
  compare(
    v.securityStreamQuerySchema,
    nativeStream.request.query,
    [
      { ticket: 'T'.repeat(43) },
      {},
      { ticket: 'bad' },
      { ticket: 'T'.repeat(43), after: id },
      { ticket: 'T'.repeat(43), extra: true },
    ],
    document.paths[stream.path].get['x-boro-query-schema'],
  );
  const eventEntry = manifest.components.find((entry) => entry.name === 'SecurityNoticeEvent');
  assert(eventEntry);
  const eventNative = (await import(pathToFileURL(join(directory, eventEntry.file)).href)).default;
  const event = { id, event: 'password_changed', createdAt: '2026-10-17T12:00:00.000000001Z' };
  compare(
    v.securityNoticeEventSchema,
    eventNative,
    [event, { ...event, event: 'unknown' }, { ...event, createdAt: '2025-02-29T00:00:00Z' }, { ...event, extra: true }],
    document.components.schemas.SecurityNoticeEvent,
  );
  assert.equal(document.paths[stream.path].get.responses[429].headers['Retry-After'].schema.minimum, 1);
  assert(document.paths[stream.path].get.responses[400].content['application/json']);
  const compiledProfile = projectSchema(v.adminUsersQuerySchema);
  assert.throws(() => new Ajv2020({ strict: true }).compile(compiledProfile), /unknown keyword/);
  for (const rules of [
    { version: 2, kind: 'text', steps: [{ op: 'trim' }] },
    { version: 1, kind: 'text', steps: [{ op: 'execute' }] },
  ])
    assert.throws(() => ajv.compile({ type: 'string', [v.CONTRACT_RULES]: rules }));
  console.log(
    `Full native/profile semantics: 43 JSON operations + SSE; ${comparisons} canonical/native/Ajv acceptance and parsed-output comparisons passed`,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
