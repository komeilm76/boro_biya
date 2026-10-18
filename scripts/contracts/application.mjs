// Bun --tsconfig-override tsconfig.base.json scripts/contracts/application.mjs [--check]
import { authOperations } from '../../packages/contracts/src/auth.ts';
import {
  absentBodySchema,
  securityStreamQuerySchema,
  securityNoticeEventSchema,
} from '../../packages/validation/src/auth.ts';
import { projectSchema } from './schema.mjs';
import { auditAuthContracts } from './audit-auth.mjs';
import { apiDocsToOpenApi, diffOpenApiDocuments, openApiToApiDocs, validateZopia } from 'zopia';
import SwaggerParser from '@apidevtools/swagger-parser';
import { mkdir, mkdtemp, readFile, writeFile, rm, readdir, realpath, symlink } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { utcInstantSchema } from '../../packages/validation/src/time.ts';
import { errorEnvelopeSchema } from '../../packages/validation/src/error-envelope.ts';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const applicationDirectory = join(root, 'api/auth');
export function buildApplicationDocument() {
  assert.equal(auditAuthContracts().readyForPublication, true, 'All source schemas must pass publication preflight');
  const document = {
    openapi: '3.1.0',
    info: {
      title: 'Boro_biya Phase 2 API',
      version: '0.1.0',
      description:
        'English diagnostic prose is not machine-readable state. The required Boro validation profile compiles normalization and sibling UTC ordering; consumers must not ignore it.',
    },
    'x-boro-validation-profile': { version: 1, keyword: 'x-boro-rules', required: true },
    security: [{ Bearer: [] }],
    paths: {},
    components: {
      schemas: {},
      securitySchemes: {
        Bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        CsrfCookie: { type: 'apiKey', in: 'cookie', name: 'boro_csrf' },
        CsrfHeader: { type: 'apiKey', in: 'header', name: 'x-csrf-token' },
        StreamTicket: { type: 'apiKey', in: 'query', name: 'ticket' },
      },
    },
  };
  for (const [name, cookie] of Object.entries({
    refresh: 'boro_refresh',
    setup: 'boro_setup',
    recovery: 'boro_recovery',
    reset: 'boro_reset',
  })) {
    document.components.securitySchemes[name] = { type: 'apiKey', in: 'cookie', name: cookie };
    document.components.securitySchemes[`${name}Secure`] = { type: 'apiKey', in: 'cookie', name: `__Host-${cookie}` };
  }
  const cache = { input: new Map(), output: new Map() };
  const component = (schema, name, io = 'input') => {
    if (cache[io].has(schema)) return cache[io].get(schema);
    document.components.schemas[name] = projectSchema(schema, { io });
    const ref = { $ref: `#/components/schemas/${name}` };
    cache[io].set(schema, ref);
    return ref;
  };
  const parameters = (schema, where) => {
    const projected = projectSchema(schema);
    return Object.entries(projected.properties ?? {}).map(([name, value]) => ({
      name,
      in: where,
      required: where === 'path' || (projected.required ?? []).includes(name),
      style: where === 'path' ? 'simple' : 'form',
      explode: where !== 'path',
      schema: value,
    }));
  };
  for (const [name, contract] of Object.entries(authOperations)) {
    const { spec, protection, csrfRequired, permission } = contract;
    const responses = {};
    for (const [status, schema] of Object.entries(spec.response)) {
      responses[status] = {
        description:
          Number(status) === contract.successStatus
            ? 'Successful operation'
            : 'Safe generic error; render the stable code with the local message catalogue',
      };
      if (status !== '204')
        responses[status].content = {
          'application/json': { schema: component(schema, `${name}Response${status}`) },
        };
      if (status === '429')
        responses[status].headers = {
          'Retry-After': { description: 'Retry delay in seconds', schema: { type: 'integer', minimum: 1 } },
        };
    }
    let security =
      protection === 'bearer'
        ? [{ Bearer: [] }]
        : ['refresh', 'setup', 'recovery', 'reset'].includes(protection)
          ? [{ [protection]: [] }, { [`${protection}Secure`]: [] }]
          : [{}];
    if (csrfRequired) security = security.map((requirement) => ({ ...requirement, CsrfCookie: [], CsrfHeader: [] }));
    if (security.length === 1 && Object.keys(security[0]).length === 0) security = [];
    const operation = {
      operationId: name,
      tags: [permission ? 'Administration' : 'Authentication'],
      security,
      parameters: [...parameters(spec.request.params, 'path'), ...parameters(spec.request.query, 'query')],
      responses,
      'x-boro-protection': protection,
      'x-boro-csrf-required': csrfRequired,
      'x-requirements': ['API-20', 'API-23', 'API-36', 'API-37'],
    };
    if (permission) operation['x-boro-permission'] = permission;
    if (csrfRequired)
      operation.parameters.push({
        name: 'Origin',
        in: 'header',
        required: true,
        description: 'Must equal the configured web origin exactly',
        schema: { type: 'string', format: 'uri' },
      });
    if (Object.keys(projectSchema(spec.request.params).properties ?? {}).length)
      operation['x-boro-params-schema'] = projectSchema(spec.request.params);
    if (Object.keys(projectSchema(spec.request.query).properties ?? {}).length)
      operation['x-boro-query-schema'] = projectSchema(spec.request.query);
    if (spec.request.body !== absentBodySchema)
      operation.requestBody = {
        required: true,
        content: { 'application/json': { schema: component(spec.request.body, `${name}Body`) } },
      };
    else operation['x-boro-no-request-body'] = true;
    if (operation.parameters.length === 0) delete operation.parameters;
    (document.paths[spec.pathShape] ??= {})[spec.method.toLowerCase()] = operation;
  }
  document.paths['/api/v1/streams/events'] = {
    get: {
      operationId: 'securityEvents',
      tags: ['Authentication'],
      security: [{ StreamTicket: [] }],
      description:
        'Single-use owner/session-bound ticket. Reconnect obtains a new ticket; cursor replay rechecks authorization and deduplicates IDs. Security change/revocation closes the connection; tickets and stream URLs must not be logged. Cursors must be lowercase UUIDv7; when both Last-Event-ID and after are supplied they must match exactly.',
      parameters: [
        ...parameters(securityStreamQuerySchema, 'query'),
        {
          name: 'Last-Event-ID',
          in: 'header',
          required: false,
          schema: projectSchema(securityStreamQuerySchema.shape.after.unwrap()),
        },
      ],
      responses: {
        200: {
          description: 'Bounded owner-only security event stream',
          content: { 'text/event-stream': { schema: { type: 'string' } } },
        },
        ...Object.fromEntries(
          [400, 401, 403, 429, 500, 503].map((status) => [
            status,
            {
              description: status === 429 ? 'Bounded stream capacity reached' : 'Safe generic stream admission error',
              content: { 'application/json': { schema: component(errorEnvelopeSchema, 'securityEventsError') } },
              ...(status === 429
                ? {
                    headers: {
                      'Retry-After': { description: 'Retry delay in seconds', schema: { type: 'integer', minimum: 1 } },
                    },
                  }
                : {}),
            },
          ]),
        ),
      },
      'x-boro-query-schema': projectSchema(securityStreamQuerySchema),
      'x-boro-sse-event-schema': component(securityNoticeEventSchema, 'SecurityNoticeEvent'),
      'x-requirements': ['AUTH-18', 'API-31', 'API-33'],
    },
  };
  return document;
}

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) for (const child of await files(path)) result.push(join(entry.name, child));
    else result.push(entry.name);
  }
  return result.sort();
}
export async function generateApplication(directory) {
  const document = buildApplicationDocument();
  await SwaggerParser.validate(structuredClone(document), { resolve: { http: false, file: false } });
  const generated = await openApiToApiDocs(document, {
    outDir: directory,
    mode: 'directory',
    insertComponents: true,
    useComponentAsReference: true,
    manifest: true,
  });
  // The only accepted diagnostics are precisely located existing UTC intersections
  // and string-array uniqueness, each independently covered by semantic fixtures.
  for (const warning of generated.warnings) {
    const node = warning.at
      .split('/')
      .slice(1)
      .reduce((value, key) => value?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], document);
    assert(
      (warning.code === 'ZOPIA_WARN_FROZEN_SUBTREE' &&
        (isDeepStrictEqual(node, projectSchema(utcInstantSchema)) ||
          isDeepStrictEqual(node, { type: ['string', 'null'] }))) ||
        (warning.code === 'ZOPIA_WARN_UNIQUE_ITEMS' &&
          node?.uniqueItems === true &&
          node.type === 'array' &&
          node.items?.type === 'string'),
      `Unproved converter diagnostic: ${warning.code} at ${warning.at}`,
    );
  }
  const manifest = JSON.parse(await readFile(join(directory, generated.manifestPath), 'utf8'));
  const helper = '.boro-profile.ts';
  const source = relative(directory, join(root, 'packages/validation/src/contract-rules.ts')).replaceAll('\\', '/');
  await writeFile(
    join(directory, helper),
    `// Generated semantic-profile compiler bridge.\nexport { restoreContractRules } from ${JSON.stringify(source.startsWith('.') ? source : `./${source}`)};\n`,
  );
  for (const entry of manifest.components) {
    const path = join(directory, entry.file);
    let text = await readFile(path, 'utf8');
    const bridge = relative(dirname(path), join(directory, helper)).replaceAll('\\', '/');
    const match = text.match(/export const (\w+) = ([\s\S]*);\n\nexport default \1;/);
    assert(match, `Unexpected generated component syntax: ${entry.name}`);
    text = text.replace(
      match[0],
      `export const ${match[1]} = restoreContractRules(${match[2]});\n\nexport default ${match[1]};`,
    );
    text = `import { restoreContractRules } from ${JSON.stringify(bridge)};\n${text}`;
    await writeFile(path, text);
  }
  for (const entry of manifest.apis) {
    const operation = document.paths[entry.path][entry.method];
    const path = join(directory, entry.file);
    let text = await readFile(path, 'utf8');
    const bridge = relative(dirname(path), join(directory, helper)).replaceAll('\\', '/');
    text = `import { restoreContractRules } from ${JSON.stringify(bridge)};\n${text}`;
    for (const [key, extension] of [
      ['query', 'x-boro-query-schema'],
      ['params', 'x-boro-params-schema'],
    ]) {
      const profile = operation[extension]?.['x-boro-rules'];
      text = text.replace(
        /\nexport default (\w+);/,
        `\n$1.request.${key} = restoreContractRules($1.request.${key}.strict().meta(${JSON.stringify(profile ? { 'x-boro-rules': profile } : {})}));\nexport default $1;`,
      );
    }
    if (operation['x-boro-no-request-body'])
      text = text.replace(
        /\nexport default (\w+);/,
        '\n$1.request.body = z.any().refine((value) => value === undefined);\nexport default $1;',
      );
    await writeFile(path, text);
  }
  // Isolated peer links are temporary, never committed.
  const requireTool = createRequire(await realpath(join(root, 'node_modules/zopia/package.json')));
  await mkdir(join(directory, 'node_modules'), { recursive: true });
  for (const name of ['zod', 'km-api'])
    await symlink(dirname(requireTool.resolve(`${name}/package.json`)), join(directory, 'node_modules', name), 'dir');
  const reversed = await apiDocsToOpenApi(directory, { version: '3.1' });
  assert.deepEqual(reversed.warnings, []);
  const diff = diffOpenApiDocuments(document, reversed.openapi);
  assert.equal(diff.identical, true, JSON.stringify(diff.changes));
  await SwaggerParser.validate(structuredClone(reversed.openapi), { resolve: { http: false, file: false } });
  const validation = await validateZopia(directory, { kind: 'docs' });
  assert.equal(validation.ok, true, JSON.stringify(validation.diagnostics));
  assert.deepEqual(validation.diagnostics, []);
  await writeFile(join(directory, 'openapi.json'), JSON.stringify(reversed.openapi, null, 2) + '\n');
  await writeFile(
    join(directory, 'conversion-diagnostics.json'),
    JSON.stringify(
      generated.warnings.map(({ code, at }) => ({ code, at })),
      null,
      2,
    ) + '\n',
  );
  const { format, resolveConfig } = createRequire(import.meta.url)('prettier');
  for (const file of await files(directory)) {
    const path = join(directory, file);
    const options = { ...(await resolveConfig(path)), filepath: path };
    // Wrapping a native fluent schema changes Prettier's first-pass chain layout.
    // Require the committed representation to be a stable formatting fixed point.
    const first = await format(await readFile(path, 'utf8'), options);
    const second = await format(first, options);
    assert.equal(await format(second, options), second, `Unstable generated formatting: ${file}`);
    await writeFile(path, second);
  }
  return { document: reversed.openapi, manifest, directory };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await mkdir(dirname(applicationDirectory), { recursive: true });
  const stage = await mkdtemp(join(dirname(applicationDirectory), '.auth-stage-'));
  try {
    await generateApplication(stage);
    if (process.argv.includes('--check')) {
      assert.deepEqual(
        await files(stage),
        await files(applicationDirectory),
        'Generated contract file inventory is stale',
      );
      for (const file of await files(stage))
        assert.equal(
          await readFile(join(stage, file), 'utf8'),
          await readFile(join(applicationDirectory, file), 'utf8'),
          `Stale generated contract: ${file}`,
        );
      console.log('Full application OpenAPI/native manifest is deterministic and current');
    } else {
      await mkdir(applicationDirectory, { recursive: true });
      const names = await files(stage);
      for (const file of names) {
        await mkdir(dirname(join(applicationDirectory, file)), { recursive: true });
        await writeFile(join(applicationDirectory, file), await readFile(join(stage, file)));
      }
      // Remove only obsolete files within this generator-owned tree.
      for (const file of await files(applicationDirectory))
        if (!names.includes(file)) await rm(join(applicationDirectory, file));
      console.log('Generated full application OpenAPI and native manifest');
    }
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
