import { describe, expect, it, vi } from 'vitest';
import type { Db } from '@boro-biya/db';
import { readAuthConfig } from '../../src/auth/config.js';
import { challengeCleanupEnabled, pruneExpiredChallenges, runRetentionPass } from '../../src/privacy/retention.js';
const env = { SESSION_SECRET: 'disposable-retention-test-material', WEB_ORIGIN: 'https://example.test' };
describe('default-off application retention policy', () => {
  it.each([
    { RETENTION_AUTOMATED_DELETION_ENABLED: 'yes' },
    { AUDIT_LOG_RETENTION_DAYS: '-1' },
    { AUDIT_LOG_RETENTION_DAYS: '' },
    { OPERATIONAL_RECORD_RETENTION_DAYS: '1.5' },
    { AUDIT_LOG_RETENTION_DAYS: '36501' },
  ])('rejects invalid retention configuration even when CAPTCHA is off: %j', (patch) => {
    expect(() => readAuthConfig({ ...env, ...patch, CAPTCHA_ENABLED: 'false' })).toThrow();
  });
  it('parses default-off and candidate-zero values without claiming general enforcement', () => {
    expect(readAuthConfig(env).retentionPolicy).toEqual({
      automatedDeletionEnabled: false,
      auditDaysCandidate: 0,
      operationalDaysCandidate: 0,
    });
    expect(
      readAuthConfig({
        ...env,
        RETENTION_AUTOMATED_DELETION_ENABLED: 'true',
        AUDIT_LOG_RETENTION_DAYS: '365',
        OPERATIONAL_RECORD_RETENTION_DAYS: '30',
      }).retentionPolicy,
    ).toEqual({ automatedDeletionEnabled: true, auditDaysCandidate: 365, operationalDaysCandidate: 30 });
  });
  it('does not connect or query without both explicit deletion approval and an enabled implemented scope', async () => {
    const connect = vi.fn(),
      query = vi.fn(),
      db = { pool: { connect, query } } as unknown as Pick<Db, 'pool'>;
    const config = readAuthConfig(env);
    expect(await runRetentionPass(db, config)).toEqual({ challengeCleanupEnabled: false, deletedChallenges: 0 });
    expect(await pruneExpiredChallenges(db.pool, config)).toBe(0);
    config.retentionPolicy!.automatedDeletionEnabled = true;
    expect(challengeCleanupEnabled(config)).toBe(false);
    expect(await runRetentionPass(db, config)).toEqual({ challengeCleanupEnabled: false, deletedChallenges: 0 });
    expect(connect).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
  it('requires the global switch even when an inconsistent fixture enables challenge cleanup', () => {
    const config = readAuthConfig({
      ...env,
      CAPTCHA_ENABLED: 'true',
      CAPTCHA_TOKEN_SECRET: 'disposable-retention-token-material',
    });
    config.captchaPolicy!.cleanup = true;
    expect(challengeCleanupEnabled(config)).toBe(false);
    delete config.retentionPolicy;
    expect(challengeCleanupEnabled(config)).toBe(false);
  });
});

it('bounds and audits the only opt-in cleanup scope, including an empty pass', async () => {
  const config = readAuthConfig({
    ...env,
    CAPTCHA_ENABLED: 'true',
    CAPTCHA_TOKEN_SECRET: 'disposable-retention-token-material',
    RETENTION_AUTOMATED_DELETION_ENABLED: 'true',
  });
  const query = vi.fn().mockResolvedValue({ rowCount: 2 });
  const client = { query } as unknown as Pick<Db['pool'], 'query'>;
  expect(await pruneExpiredChallenges(client, config)).toBe(2);
  expect(query.mock.calls[0]?.[0]).toContain('LIMIT 100');
  expect(query.mock.calls[0]?.[1]).toEqual([300]);
  expect(query.mock.calls[1]?.[1]).toEqual([{ count: 2 }]);
  query.mockClear();
  query.mockResolvedValue({ rowCount: null });
  expect(await pruneExpiredChallenges(client, config)).toBe(0);
  expect(query).toHaveBeenCalledTimes(1);
});
