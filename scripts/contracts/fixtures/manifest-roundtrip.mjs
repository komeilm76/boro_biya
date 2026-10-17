import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, realpath, rename, rm, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';
import { apiDocsToOpenApi, diffOpenApiDocuments, openApiToApiDocs, validateZopia } from 'zopia';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const spec = JSON.parse(await readFile(new URL('./openapi31.json', import.meta.url), 'utf8'));
await mkdir(join(root, 'tmp'), { recursive: true });
async function roundTrip(spec, discriminated) {
  const directory = await mkdtemp(join(root, 'tmp', 'contract-fidelity-'));
  try {
    await SwaggerParser.validate(structuredClone(spec), { resolve: { http: false, file: false } });
    const generated = await openApiToApiDocs(spec, {
      outDir: directory,
      mode: 'directory',
      insertComponents: true,
      useComponentAsReference: true,
      manifest: true,
    });
    assert(generated.manifestPath, 'the tool must emit the manifest, not just endpoint files');

    // Isolate generated fixture execution from workspace hoisting. These temporary links point
    // to the pinned tool's installed peers; nothing is downloaded or committed by this test.
    const require = createRequire(await realpath(join(root, 'node_modules/zopia/package.json')));
    await mkdir(join(directory, 'node_modules'));
    for (const name of ['zod', 'km-api']) {
      const packageDirectory = dirname(require.resolve(`${name}/package.json`));
      await symlink(packageDirectory, join(directory, 'node_modules', name), 'dir');
    }
    const reversed = await apiDocsToOpenApi(directory, { version: '3.1' });
    await SwaggerParser.validate(structuredClone(reversed.openapi), { resolve: { http: false, file: false } });
    const diagnostics = generated.warnings.map(({ code, at }) => ({ code, at }));
    assert.deepEqual(diagnostics, [
      { code: 'ZOPIA_WARN_FROZEN_SUBTREE', at: '#/components/schemas/Payload/properties/choice' },
      { code: 'ZOPIA_WARN_FROZEN_SUBTREE', at: '#/components/schemas/Payload/properties/nullable' },
      ...(discriminated ? [{ code: 'ZOPIA_WARN_ONE_OF', at: '#/components/schemas/Payload/properties/variant' }] : []),
      {
        code: 'ZOPIA_WARN_CUSTOM_FORMAT',
        at: '#/paths/~1fixtures~1upload/post/requestBody/content/multipart~1form-data/schema/properties/file',
      },
      {
        code: 'ZOPIA_WARN_CUSTOM_FORMAT',
        at: '#/paths/~1fixtures~1upload/post/responses/200/content/application~1octet-stream/schema',
      },
    ]);
    const diff = diffOpenApiDocuments(spec, reversed.openapi);
    if (discriminated) {
      // This is a negative regression, not an exception to the publication gate. The tool
      // changes this construct despite emitting no reverse/validation diagnostics.
      assert.equal(diff.identical, false);
      assert.deepEqual(diff.changes, [
        {
          kind: 'changed',
          area: 'component',
          at: '#/components/schemas/Payload',
          message: 'component Payload: schema changed',
          depth: 0,
        },
      ]);
      const variant = reversed.openapi.components.schemas.Payload.properties.variant;
      assert.equal(variant.type, undefined);
      assert(Array.isArray(variant.allOf));
      assert.deepEqual(variant.oneOf, spec.components.schemas.Payload.properties.variant.oneOf);
      assert.deepEqual(variant.discriminator, spec.components.schemas.Payload.properties.variant.discriminator);
      reversed.openapi.components.schemas.Payload.properties.variant =
        spec.components.schemas.Payload.properties.variant;
      assert.equal(diffOpenApiDocuments(spec, reversed.openapi).identical, true);
    } else {
      assert.equal(diff.identical, true, JSON.stringify(diff.changes));
    }
    assert.deepEqual(reversed.warnings, []);
    const result = await validateZopia(directory, { kind: 'docs' });
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.deepEqual(result.diagnostics, []);
    const manifestPath = join(directory, generated.manifestPath);
    await rename(manifestPath, `${manifestPath}.missing`);
    await assert.rejects(apiDocsToOpenApi(directory, { version: '3.1' }), /manifest/i);
    await rename(`${manifestPath}.missing`, manifestPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
const structural = structuredClone(spec);
delete structural.components.schemas.Payload.properties.variant;
await roundTrip(structural, false);
await roundTrip(spec, true);
console.log('manifest-roundtrip fidelity: structural round trip passed; discriminator drift detected, not accepted');
