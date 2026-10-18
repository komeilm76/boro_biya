import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Build metadata (OPS-61): the version comes from the package manifest. The build commit is
 * configuration (BUILD_COMMIT, validated by packages/config): CI and release builds set it from
 * `git rev-parse HEAD` (QA-91), and both values appear in every `/healthz` response so a
 * deployment always identifies itself.
 */
function readManifestVersion(): string {
  const manifestPath = fileURLToPath(new URL('../package.json', import.meta.url));
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (typeof parsed === 'object' && parsed !== null) {
    const version = (parsed as Record<string, unknown>)['version'];
    if (typeof version === 'string' && version !== '') return version;
  }
  throw new Error('package.json carries no version; refusing to start without build metadata (OPS-61)');
}

export const BUILD_VERSION: string = readManifestVersion();
