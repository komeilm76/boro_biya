import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../../', import.meta.url));

describe('OpenAPI conversion fidelity (API-08, API-30)', () => {
  it('rejects silent loss of executable auth validation with the pinned tools', () => {
    const result = spawnSync('bun', ['scripts/contracts/fixtures/executable-validation.mjs'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('5 real auth regressions and structural boundaries passed');
  });

  it('verifies manifest fidelity and detects discriminator drift independently of validator success', () => {
    const result = spawnSync('bun', ['scripts/contracts/fixtures/manifest-roundtrip.mjs'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('structural round trip passed; discriminator drift detected, not accepted');
  });
});
