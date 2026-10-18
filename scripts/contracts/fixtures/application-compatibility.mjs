// Apply the conservative checker to the real application artefact, not only fixtures.
// This is a development/bootstrap comparison, NOT released-contract acceptance.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { applicationDirectory, buildApplicationDocument } from '../application.mjs';
import { checkContractCompatibility } from '../compatibility.mjs';
const baseline = JSON.parse(await readFile(join(applicationDirectory, 'openapi.json'), 'utf8'));
const candidate = buildApplicationDocument();
const result = await checkContractCompatibility(baseline, candidate);
assert.equal(result.compatible, true);
assert.deepEqual(result.findings, []);
for (const mutate of [
  (document) => {
    delete document.components.schemas.SecurityStreamResume['x-boro-rules'];
  },
  (document) => {
    delete document.paths['/api/v1/streams/events'].get['x-boro-request-parser'];
  },
  (document) => {
    delete document.paths['/api/v1/auth/login'];
  },
  (document) => {
    document.paths['/api/v1/admin/users'].get.security = [];
  },
  (document) => {
    document.paths['/api/v1/admin/users'].get['x-boro-query-schema']['x-boro-rules'] = { version: 99 };
  },
  (document) => {
    delete document.paths['/api/v1/admin/audit-events'].get['x-boro-query-schema']['x-boro-rules'];
  },
  (document) => {
    document.paths['/api/v1/streams/events'].get.security = [];
  },
  (document) => {
    document.components.schemas.adminLockBody.properties.reason['x-boro-rules'].steps.shift();
  },
  (document) => {
    document.components.schemas.csrfResponse400.additionalProperties = false;
  },
]) {
  const changed = structuredClone(candidate);
  mutate(changed);
  assert.equal((await checkContractCompatibility(baseline, changed)).compatible, false);
}
assert.deepEqual(baseline, JSON.parse(await readFile(join(applicationDirectory, 'openapi.json'), 'utf8')));
console.log(
  'Real application development comparison passed; nine semantic/removal/security changes rejected; no released baseline claimed',
);
