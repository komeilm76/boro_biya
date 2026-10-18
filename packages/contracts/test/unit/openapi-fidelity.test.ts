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
    expect(result.stdout).toContain('4 real auth regressions and portable calendar/uniqueness boundaries passed');
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
  it('preserves challenge branch validation without lossy discriminator metadata', () => {
    const result = spawnSync('bun', ['scripts/contracts/fixtures/portable-challenge.mjs'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain(
      'portable challenge union: original/JSON Schema/generated validation and exact manifest round trip passed',
    );
  });
  it.each([
    [
      'portable-text',
      'portable text: prior/runtime/JSON Schema/generated content validation and exact manifest round trip passed',
    ],
    ['compatibility', 'contract compatibility: additive proof and semantic/removal rejection passed'],
  ])('verifies %s without weakening the publication boundary', (fixture, message) => {
    const result = spawnSync('bun', [`scripts/contracts/fixtures/${fixture}.mjs`], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain(message);
  });
  it.each(['valid', 'removed', 'missing', 'malformed', 'usage'])(
    'checks the compatibility CLI %s case within the unchanged test budget',
    (mode) => {
      const result = spawnSync('bun', ['scripts/contracts/fixtures/compatibility-cli.mjs', mode], {
        cwd: root,
        encoding: 'utf8',
        timeout: 30_000,
      });
      expect(result.error).toBeUndefined();
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(result.stdout).toContain(`compatibility CLI ${mode} passed`);
    },
  );
  it('audits every actual binding and refuses partial/unsupported publication', () => {
    const result = spawnSync('bun', ['--tsconfig-override', 'tsconfig.base.json', 'scripts/contracts/audit-auth.mjs'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(1);
    const report = JSON.parse(result.stdout) as {
      operations: number;
      schemas: number;
      readyForPublication: boolean;
      blockers: Array<{ at: string; kind: string }>;
    };
    expect(report.operations).toBe(43);
    expect(report.schemas).toBe(627);
    expect(report.readyForPublication).toBe(false);
    expect(report.blockers.map(({ at }) => at)).toEqual([
      'reportSecurity/request/body',
      'adminUsers/request/query',
      'adminAudit/request/query',
      'adminLock/request/body',
      'adminUnlock/request/body',
      'adminBan/request/body',
      'adminUnban/request/body',
      'adminDeactivate/request/body',
      'adminReactivate/request/body',
      'reissueSetupCredential/request/body',
    ]);
    expect(report.blockers.every(({ kind }) => kind === 'executable-validation')).toBe(true);
  });
});
