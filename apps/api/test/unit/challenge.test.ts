import { describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import type { Db } from '@boro-biya/db';
import { createChallengeService, validChallengeWork } from '../../src/auth/challenge.js';
import { readAuthConfig } from '../../src/auth/config.js';
function fixture() {
  const config = readAuthConfig({
    SESSION_SECRET: 'disposable-challenge-unit-session-material',
    WEB_ORIGIN: 'https://example.test',
    CAPTCHA_ENABLED: 'true',
    CAPTCHA_TOKEN_SECRET: 'disposable-challenge-unit-token-material',
    CAPTCHA_WORK_BITS: '12',
    CAPTCHA_RISK_THRESHOLD: '1',
  });
  const state = {
    count: 0,
    found: true,
    live: true,
    attempts: 0,
    purpose: 'login',
    origin: 'origin',
    claimed: true,
    expiresDuringVerify: false,
  };
  const hash = (scope: string, value: string) =>
    createHmac('sha256', config.captchaPolicy!.secret).update(`${scope}:${value}`).digest('hex');
  const query = vi.fn(async (sql: string): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> => {
    await Promise.resolve();
    let rows: Record<string, unknown>[] = [];
    if (sql.startsWith('SELECT count') || sql.includes('RETURNING cardinality')) rows = [{ count: state.count }];
    else if (sql.includes('RETURNING expires_at')) rows = [{ expires_at: new Date('2030-01-01') }];
    else if (sql.startsWith('SELECT work_bits'))
      rows = state.found
        ? [
            {
              work_bits: 12,
              attempts: state.attempts,
              live: state.live,
              purpose: state.purpose,
              origin_hash: hash('origin', state.origin),
            },
          ]
        : [];
    else if (sql.includes('RETURNING grant_expires_at'))
      rows = state.expiresDuringVerify ? [] : [{ grant_expires_at: new Date('2030-01-01') }];
    else if (sql.includes('SET grant_consumed_at')) rows = state.claimed ? [{}] : [];
    return { rows, rowCount: rows.length };
  });
  const release = vi.fn(),
    reserve = vi.fn().mockResolvedValue(undefined);
  const db = { pool: { query, connect: vi.fn().mockResolvedValue({ query, release }) } } as unknown as Pick<Db, 'pool'>;
  const service = createChallengeService(db, config, reserve);
  return { service, config, state, query, release, reserve };
}
const token = 'A'.repeat(43);
function answer() {
  let i = 0;
  while (!validChallengeWork(token, i, 12)) i++;
  return i;
}
describe('computational challenge bounds and orchestration', () => {
  it('validates the complete opaque-token/counter/bit protocol', () => {
    expect(validChallengeWork(token, answer(), 12)).toBe(true);
    for (const [nonce, counter, bits] of [
      ['bad', 0, 12],
      [token, -1, 12],
      [token, 0.1, 12],
      [token, 0x100000000, 12],
      [token, 0, 11],
      [token, 0, 21],
      [token, 0, 12.5],
    ] as const)
      expect(validChallengeWork(nonce, counter, bits)).toBe(false);
  });
  it('does no work when disabled and fails closed for enabled missing policy', async () => {
    const f = fixture();
    f.config.captchaEnabled = false;
    expect(await f.service.issue('login', 'origin', 'issue')).toEqual({ required: false });
    await f.service.admit('login', 'origin', 'admit');
    expect(f.query).not.toHaveBeenCalled();
    await expect(f.service.verify(token, 0, 'login', 'origin', 'verify')).rejects.toMatchObject({ statusCode: 503 });
    f.config.captchaEnabled = true;
    delete f.config.captchaPolicy;
    expect(() => f.service.configured()).toThrow();
  });
  it('caps adaptive difficulty and optionally cleans only under the explicit deletion switch', async () => {
    const f = fixture();
    expect(await f.service.issue('login', 'origin', 'low')).toEqual({ required: false });
    f.state.count = 300;
    f.config.captchaPolicy!.cleanup = true;
    f.config.retentionPolicy!.automatedDeletionEnabled = true;
    expect(await f.service.issue('login', 'origin', 'high')).toMatchObject({ required: true, bits: 20 });
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('DELETE'))).toBe(true);
    f.config.captchaPolicy!.adaptive = false;
    expect(await f.service.issue('login', 'origin', 'fixed')).toMatchObject({ required: true, bits: 12 });
  });
  it('reserves quotas before database access and rolls back unexpected failures', async () => {
    const f = fixture();
    f.reserve.mockRejectedValue(new Error('quota'));
    await expect(f.service.issue('login', 'origin', 'issue')).rejects.toThrow('quota');
    expect(f.query).not.toHaveBeenCalled();
    f.reserve.mockResolvedValue(undefined);
    f.state.count = 1;
    f.query.mockRejectedValueOnce(new Error('database'));
    await expect(f.service.issue('login', 'origin', 'issue')).rejects.toThrow('database');
  });
  it('rejects malformed, unknown, expired, wrong-origin/purpose and exhausted nonces', async () => {
    const f = fixture();
    await expect(f.service.verify('bad', 0, 'login', 'origin', 'bad')).rejects.toMatchObject({ statusCode: 403 });
    for (const patch of [
      { found: false },
      { live: false },
      { purpose: 'setup' },
      { origin: 'other' },
      { attempts: 5 },
    ]) {
      const test = fixture();
      Object.assign(test.state, patch);
      await expect(test.service.verify(token, answer(), 'login', 'origin', 'bad')).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(test.release).toHaveBeenCalled();
    }
  });
  it('commits wrong-work attempts, verifies valid work and rejects expiry during verification', async () => {
    const f = fixture();
    let wrong = 0;
    while (validChallengeWork(token, wrong, 12)) wrong++;
    await expect(f.service.verify(token, wrong, 'login', 'origin', 'wrong')).rejects.toMatchObject({ statusCode: 403 });
    expect(f.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(true);
    await expect(f.service.verify(token, answer(), 'login', 'origin', 'good')).resolves.toHaveProperty('grant');
    f.state.expiresDuringVerify = true;
    await expect(f.service.verify(token, answer(), 'login', 'origin', 'expired')).rejects.toMatchObject({
      statusCode: 403,
    });
  });
  it('counts admission, rejects absent/invalid/replayed grants and consumes only a live bound proof', async () => {
    const f = fixture();
    await f.service.admit('login', 'origin', 'low');
    f.state.count = 1;
    for (const proof of [undefined, 'bad'])
      await expect(f.service.admit('login', 'origin', 'required', proof)).rejects.toMatchObject({ statusCode: 403 });
    f.state.claimed = false;
    await expect(f.service.admit('login', 'origin', 'replay', token)).rejects.toMatchObject({ statusCode: 403 });
    f.state.claimed = true;
    await f.service.admit('login', 'origin', 'live', token);
    expect(f.query.mock.calls.some(([sql]) => sql.includes('FOR UPDATE'))).toBe(true);
  });
});
describe('challenge configuration boundaries', () => {
  const base = {
    SESSION_SECRET: 'disposable-challenge-unit-session-material',
    WEB_ORIGIN: 'https://example.test',
    CAPTCHA_ENABLED: 'true',
    CAPTCHA_TOKEN_SECRET: 'disposable-challenge-unit-token-material',
  };
  it.each([
    { CAPTCHA_TOKEN_SECRET: '' },
    { CAPTCHA_TOKEN_SECRET: '<placeholder>' },
    { CAPTCHA_TOKEN_SECRET: 'short' },
    { CAPTCHA_WORK_BITS: '11' },
    { CAPTCHA_WORK_BITS: '21' },
    { CAPTCHA_RISK_THRESHOLD: '31' },
    { CAPTCHA_CHALLENGE_TTL_SECONDS: '301' },
    { CAPTCHA_MAX_ATTEMPTS: '11' },
    { CAPTCHA_ADAPTIVE: 'invalid' },
    { RETENTION_AUTOMATED_DELETION_ENABLED: 'invalid' },
  ])('rejects invalid challenge policy %j', (patch) => {
    expect(() => readAuthConfig({ ...base, ...patch })).toThrow();
  });
});
