import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkContractCompatibility } from '../compatibility.mjs';

const baseline = JSON.parse(await readFile(new URL('./openapi31.json', import.meta.url), 'utf8'));
baseline.components.schemas.Unused = { type: 'string' };
const snapshot = structuredClone(baseline);
const unchanged = await checkContractCompatibility(baseline, structuredClone(baseline));
assert.equal(unchanged.compatible, true);
assert.equal(unchanged.diff.identical, true);

const additive = structuredClone(baseline);
additive.info.version = '1.1.0';
additive.paths['/fixtures/new'] = {
  get: { operationId: 'newOperation', responses: { 204: { description: 'No content' } } },
};
additive.paths['/fixtures/{id}'].get = { operationId: 'newMethod', responses: { 204: { description: 'No content' } } };
additive.components.schemas.New = { type: 'string' };
assert.equal((await checkContractCompatibility(baseline, additive)).compatible, true);

const cases = [
  [
    'path removal',
    (spec) => {
      delete spec.paths['/fixtures/{id}'];
    },
    'incompatible',
  ],
  [
    'method removal',
    (spec) => {
      delete spec.paths['/fixtures/{id}'].post;
    },
    'incompatible',
  ],
  [
    'component removal',
    (spec) => {
      delete spec.components.schemas.Unused;
    },
    'incompatible',
  ],
  [
    'default security removal',
    (spec) => {
      spec.security = [];
    },
    'unproven',
  ],
  [
    'new default security',
    (spec) => {
      spec.security = [{ Bearer: ['new-scope'] }];
    },
    'unproven',
  ],
  [
    'operation security',
    (spec) => {
      spec.paths['/fixtures/{id}'].post.security = [];
    },
    'unproven',
  ],
  [
    'success status',
    (spec) => {
      const op = spec.paths['/fixtures/{id}'].post;
      op.responses[201] = op.responses[200];
      delete op.responses[200];
    },
    'unproven',
  ],
  [
    'required parameter',
    (spec) => {
      spec.paths['/fixtures/{id}'].post.parameters.push({
        in: 'query',
        name: 'requiredNew',
        required: true,
        schema: { type: 'string' },
      });
    },
    'unproven',
  ],
  [
    'parameter serialization',
    (spec) => {
      spec.paths['/fixtures/{id}'].post.parameters[0].style = 'label';
    },
    'unproven',
  ],
  [
    'request requiredness',
    (spec) => {
      spec.paths['/fixtures/{id}'].post.requestBody.required = false;
    },
    'unproven',
  ],
  [
    'property named description',
    (spec) => {
      spec.components.schemas.Payload.properties.description = { type: 'string' };
    },
    'unproven',
  ],
  [
    'required response property',
    (spec) => {
      spec.components.schemas.Payload.required.push('newRequired');
      spec.components.schemas.Payload.properties.newRequired = { type: 'string' };
    },
    'unproven',
  ],
  [
    'enum narrowing',
    (spec) => {
      spec.components.schemas.Unused.enum = ['restricted'];
    },
    'unproven',
  ],
  [
    'nullable change',
    (spec) => {
      spec.components.schemas.Payload.properties.nullable = { type: 'string' };
    },
    'unproven',
  ],
  [
    'strictness change',
    (spec) => {
      spec.components.schemas.Payload.additionalProperties = true;
    },
    'unproven',
  ],
  [
    'format change',
    (spec) => {
      spec.components.schemas.Unused.format = 'uuid';
    },
    'unproven',
  ],
  [
    'extension change',
    (spec) => {
      spec['x-contract-validation'] = { required: true };
    },
    'unproven',
  ],
  [
    'component extension',
    (spec) => {
      spec.components['x-contract-validation'] = { required: true };
    },
    'unproven',
  ],
  [
    'path extension',
    (spec) => {
      spec.paths['x-contract-validation'] = { required: true };
    },
    'unproven',
  ],
];
for (const [name, change, status] of cases) {
  const candidate = structuredClone(baseline);
  change(candidate);
  const result = await checkContractCompatibility(baseline, candidate);
  assert.equal(result.compatible, false, name);
  assert.equal(result.status, status, name);
  assert(result.findings.length > 0, name);
}
assert.deepEqual(baseline, snapshot);

const invalid = structuredClone(baseline);
invalid.openapi = '3.0.3';
await assert.rejects(checkContractCompatibility(baseline, invalid), /OpenAPI 3.1/);
await assert.rejects(checkContractCompatibility(undefined, baseline));
const unresolved = structuredClone(baseline);
unresolved.paths['/fixtures/{id}'].post.responses[200] = { $ref: '#/components/responses/Missing' };
await assert.rejects(checkContractCompatibility(baseline, unresolved));
const external = structuredClone(baseline);
external.paths['/fixtures/{id}'].post.responses[200] = { $ref: 'https://not-fetched.invalid/response.json#/response' };
await assert.rejects(checkContractCompatibility(baseline, external), /bundled local references/);

console.log('contract compatibility: additive proof and semantic/removal rejection passed');
