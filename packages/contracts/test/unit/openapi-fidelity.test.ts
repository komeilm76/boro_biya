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
    expect(result.stdout).toContain('3 real auth regressions and portable calendar/uniqueness boundaries passed');
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
  it('preserves calendar semantics in JSON Schema and generated Zod across the manifest round trip', () => {
    const result = spawnSync('bun', ['scripts/contracts/fixtures/portable-time.mjs'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('runtime/JSON Schema equivalence and exact manifest round trip passed');
  });
  it('preserves role/permission uniqueness and UUIDv7 validation through the native manifest', () => {
    const result = spawnSync('bun', ['scripts/contracts/fixtures/portable-uniqueness.mjs'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('original/JSON Schema/generated validation and exact manifest round trip passed');
  });
  it('preserves UUIDv7 in required, optional, nullable and array contracts', () => {
    const result = spawnSync('bun', ['scripts/contracts/fixtures/portable-uuid.mjs'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain(
      'portable UUIDv7: original/JSON Schema/generated validation and exact manifest round trip passed',
    );
  });
});
