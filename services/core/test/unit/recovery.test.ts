import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { Db } from '@boro-biya/db';
import { readAuthConfig } from '../../src/auth/config.js';
import { createRecoveryService } from '../../src/auth/recovery.js';

function fixture(real = true) {
  const config = readAuthConfig({
    SESSION_SECRET: 'disposable-recovery-unit-secret-material',
    WEB_ORIGIN: 'https://example.test',
  });
  const user = {
    id: 'user',
    username_normalized: 'alice',
    password_hash: 'old',
    account_status: 'active',
    password_setup_required: false,
    security_setup_required: false,
  };
  const answers = [1, 2, 3, 4, 5].map((question_id) => ({
    question_id,
    answer_hash: 'hash',
    normalization_version: 1,
  }));
  let flow: Record<string, unknown> = {};
  const query = vi.fn(
    async (sql: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> => {
      await Promise.resolve();
      let rows: Record<string, unknown>[] = [];
      if (sql.startsWith('SELECT id FROM core.users WHERE username')) rows = real ? [{ id: 'user' }] : [];
      else if (sql.startsWith('SELECT id, username_normalized')) rows = [{ ...user }];
      else if (sql.includes('FROM core.user_security_answers')) rows = answers.map((answer) => ({ ...answer }));
      else if (sql.includes('INSERT INTO core.password_reset_challenges')) {
        flow = {
          token_hash: params[0],
          user_id: params[1],
          account_key_hash: params[2],
          credential_fingerprint: params[3],
          question_ids: params[4],
          phase: 'challenge',
          attempts: 0,
          live: true,
          grant_live: true,
          grant_hash: null,
        };
        rows = [{ cookie_expires: new Date('2030-01-01') }];
      } else if (sql.includes('FROM core.password_reset_challenges'))
        rows = params[0] === flow['token_hash'] ? [{ ...flow }] : [];
      else if (sql.includes('FROM core.security_questions'))
        rows = (flow['question_ids'] as number[]).map((id) => ({ id, text_key: `securityQuestions.q${id}` }));
      else if (sql.includes('SET attempts = attempts + 1')) flow['attempts'] = Number(flow['attempts']) + 1;
      else if (sql.includes("SET phase = 'verified'")) {
        flow['phase'] = 'verified';
        flow['grant_hash'] = params[1];
        rows = [{ grant_expires_at: new Date('2030-01-01') }];
      } else if (sql.includes("SET phase = 'consumed'")) flow['phase'] = 'consumed';
      return { rows, rowCount: rows.length };
    },
  );
  const release = vi.fn();
  const db = { pool: { query, connect: vi.fn().mockResolvedValue({ query, release }) } } as unknown as Pick<Db, 'pool'>;
  const hasher = { hash: vi.fn().mockResolvedValue('new-hash'), verify: vi.fn().mockResolvedValue(true) };
  const reserve = vi.fn().mockResolvedValue(undefined);
  const service = createRecoveryService(db, config, hasher, 'dummy', reserve);
  const start = () => service.forgot('Alice', 'origin', 'request');
  const input = () => (flow['question_ids'] as number[]).map((questionId) => ({ questionId, answer: 'answer' }));
  return { service, config, user, answers, query, hasher, reserve, start, input, flow: () => flow };
}
const password = 'Sailing!violet782';

describe('recovery orchestration and admission', () => {
  it('hashes proofs, persists a unique sample, verifies all answers and atomically revokes/notifies on reset', async () => {
    const f = fixture();
    const flow = await f.start();
    expect(flow.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(f.flow()['token_hash']).toBe(createHash('sha256').update(flow.token).digest('hex'));
    expect(new Set(f.flow()['question_ids'] as number[]).size).toBe(3);
    expect(await f.service.questions(flow.token, 'origin', 'request')).toHaveLength(3);
    const grant = await f.service.verify(flow.token, f.input(), 'origin', 'request');
    expect(f.hasher.verify).toHaveBeenCalledTimes(3);
    expect(f.flow()['grant_hash']).not.toBe(grant.token);
    await expect(
      f.service.reset(flow.token, grant.token, password, password, 'origin', 'request'),
    ).resolves.toBeUndefined();
    expect(f.flow()['phase']).toBe('consumed');
    const sql = f.query.mock.calls.map((call) => call[0]).join('\n');
    expect(sql).toContain('UPDATE core.session_families');
    expect(sql).toContain('INSERT INTO core.notifications');
    expect(sql).toContain('INSERT INTO core.audit_events');
    expect(sql).toContain('COMMIT');
  });
  it.each([false, true])('does dummy work for fake/ineligible flows (ineligible=%s)', async (ineligible) => {
    const f = fixture(ineligible);
    if (ineligible) f.user.account_status = 'banned';
    const flow = await f.start();
    expect(f.flow()['user_id']).toBeNull();
    await expect(f.service.verify(flow.token, f.input(), 'origin', 'request')).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(f.hasher.verify).toHaveBeenCalledTimes(3);
  });
  it.each(['bad', undefined, 'A'.repeat(43)])('rejects malformed/missing/unknown flow %s', async (token) => {
    const f = fixture();
    await expect(f.service.questions(token, 'origin', 'request')).rejects.toBeDefined();
    expect(f.hasher.verify).not.toHaveBeenCalled();
  });
  it.each(['expired', 'consumed', 'budget'])('rejects %s flows before native work', async (mode) => {
    const f = fixture();
    const flow = await f.start();
    if (mode === 'expired') f.flow()['live'] = false;
    if (mode === 'consumed') f.flow()['phase'] = 'consumed';
    if (mode === 'budget') f.flow()['attempts'] = f.config.recoveryAttempts;
    await expect(f.service.questions(flow.token, 'origin', 'request')).rejects.toBeDefined();
    await expect(f.service.verify(flow.token, f.input(), 'origin', 'request')).rejects.toBeDefined();
    expect(f.hasher.verify).not.toHaveBeenCalled();
  });
  it('consumes exhausted guesses and still verifies all three on wrong/malformed input', async () => {
    const f = fixture();
    const flow = await f.start();
    f.hasher.verify.mockResolvedValue(false);
    f.flow()['attempts'] = f.config.recoveryAttempts - 1;
    await expect(
      f.service.verify(flow.token, [{ questionId: 8, answer: '' }], 'origin', 'request'),
    ).rejects.toBeDefined();
    expect(f.hasher.verify).toHaveBeenCalledTimes(3);
    expect(f.flow()['phase']).toBe('consumed');
  });
  it.each(['recovery', 'captcha'])('disables %s before admission or database work', async (mode) => {
    const f = fixture();
    if (mode === 'recovery') f.config.recoveryEnabled = false;
    else f.config.captchaEnabled = true;
    for (const call of [
      () => f.start(),
      () => f.service.questions(undefined, 'origin', 'request'),
      () => f.service.verify(undefined, [], 'origin', 'request'),
      () => f.service.reset(undefined, undefined, password, password, 'origin', 'request'),
    ])
      await expect(call()).rejects.toBeDefined();
    expect(f.query).not.toHaveBeenCalled();
    expect(f.reserve).not.toHaveBeenCalled();
  });
  it('retains a grant after policy rejection but invalidates it on credential change', async () => {
    const f = fixture();
    const flow = await f.start();
    const grant = await f.service.verify(flow.token, f.input(), 'origin', 'request');
    await expect(
      f.service.reset(flow.token, grant.token, password, 'mismatch', 'origin', 'request'),
    ).rejects.toBeDefined();
    await expect(f.service.reset(flow.token, undefined, password, password, 'origin', 'request')).rejects.toBeDefined();
    await expect(
      f.service.reset(flow.token, 'Z'.repeat(43), password, password, 'origin', 'request'),
    ).rejects.toBeDefined();
    f.user.password_hash = 'changed';
    await expect(
      f.service.reset(flow.token, grant.token, password, password, 'origin', 'request'),
    ).rejects.toBeDefined();
    expect(f.hasher.hash).not.toHaveBeenCalled();
  });
  it('rechecks credential state after slow hashing', async () => {
    const f = fixture();
    const flow = await f.start();
    const grant = await f.service.verify(flow.token, f.input(), 'origin', 'request');
    f.hasher.hash.mockImplementation(async () => {
      f.user.account_status = 'banned';
      return await Promise.resolve('new');
    });
    await expect(
      f.service.reset(flow.token, grant.token, password, password, 'origin', 'request'),
    ).rejects.toBeDefined();
    expect(f.flow()['phase']).toBe('verified');
  });
  it('creates fake flows for invalid usernames without storing the username', async () => {
    const f = fixture(false);
    await f.service.forgot('not a username', 'origin', 'request');
    expect(f.flow()['user_id']).toBeNull();
    expect(JSON.stringify(f.flow())).not.toContain('not a username');
  });
});
