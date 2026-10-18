import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { Db } from '@boro-biya/db';
import { createSetupService } from '../../src/auth/setup.js';
import { readAuthConfig } from '../../src/auth/config.js';
const raw = 'A'.repeat(43);
const password = 'Fresh!orchard762';
const answers = [1, 2, 3, 4, 5].map((questionId) => ({ questionId, answer: 'new answer' }));
function fixture() {
  const user = {
    id: 'user',
    password_hash: 'old-hash',
    username_normalized: 'created_user',
    account_status: 'active',
    password_setup_required: true,
    security_setup_required: true,
    credential_live: true,
  };
  const state = {
    allowed: true,
    active: true,
    found: true,
    live: true,
    fingerprint: createHash('sha256').update('old-hash').digest('hex'),
    catalogue: 5,
    duplicate: false,
  };
  const query = vi.fn(
    async (sql: string, values: unknown[] = []): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> => {
      await Promise.resolve();
      if (sql.includes('SELECT s.id FROM core.sessions')) return { rows: [], rowCount: state.active ? 1 : 0 };
      if (sql.includes('SELECT 1 FROM core.user_roles')) return { rows: [], rowCount: state.allowed ? 1 : 0 };
      if (sql.startsWith('SELECT id, password_hash'))
        return { rows: state.found ? [{ ...user }] : [], rowCount: state.found ? 1 : 0 };
      if (sql.startsWith('SELECT id FROM core.users WHERE username'))
        return { rows: state.found ? [{ id: 'user' }] : [], rowCount: 1 };
      if (sql.startsWith('SELECT user_id FROM core.account_setup_flows'))
        return { rows: state.found ? [{ user_id: 'user' }] : [], rowCount: 1 };
      if (sql.startsWith('SELECT credential_fingerprint'))
        return { rows: [{ credential_fingerprint: state.fingerprint, live: state.live }], rowCount: 1 };
      if (sql.startsWith('INSERT INTO core.users')) {
        if (state.duplicate) throw Object.assign(new Error('private constraint'), { code: '23505' });
        return { rows: [{ id: 'created', setup_credential_expires_at: new Date('2030-01-01') }], rowCount: 1 };
      }
      if (sql.startsWith('INSERT INTO core.account_setup_flows'))
        return { rows: [{ expires_at: new Date('2030-01-01') }], rowCount: 1 };
      if (sql.startsWith('UPDATE core.users SET setup_credential_consumed_at')) user.credential_live = false;
      if (sql.startsWith('UPDATE core.users SET password_hash')) {
        user.password_hash = String(values[1]);
        user.password_setup_required = false;
      }
      if (sql.startsWith('UPDATE core.account_setup_flows SET credential_fingerprint'))
        state.fingerprint = String(values[1]);
      if (sql.startsWith('UPDATE core.users SET security_setup_required')) user.security_setup_required = false;
      if (sql.startsWith('UPDATE core.account_setup_flows SET consumed_at')) state.live = false;
      if (sql.startsWith('SELECT id FROM core.security_questions')) return { rows: [], rowCount: state.catalogue };
      return { rows: [], rowCount: 1 };
    },
  );
  const release = vi.fn();
  const db = { pool: { query, connect: vi.fn().mockResolvedValue({ query, release }) } } as unknown as Pick<Db, 'pool'>;
  const config = readAuthConfig({
    SESSION_SECRET: 'disposable-unit-setup-signing-material',
    WEB_ORIGIN: 'https://example.test',
  });
  const hasher = {
    verify: vi.fn((_hash: string, value: string) => Promise.resolve(value === 'old-password')),
    hash: vi.fn().mockResolvedValue('new-hash'),
  };
  const reserve = vi.fn().mockResolvedValue(undefined);
  return {
    user,
    state,
    query,
    config,
    hasher,
    reserve,
    service: createSetupService(db, config, hasher, 'dummy', reserve),
  };
}
describe('restricted first-login orchestration', () => {
  it('generates a display-once credential and audits creation with a default user role', async () => {
    const f = fixture();
    const result = await f.service.create(
      'admin',
      'session',
      'old-password',
      { username: 'created_user' },
      'origin',
      'request',
    );
    expect(result.setupCredential).toHaveLength(45);
    expect(result.expiresAt).toBe('2030-01-01T00:00:00.000Z');
    expect(f.query.mock.calls.some(([sql]) => sql.includes("key = 'user'"))).toBe(true);
  });
  it.each(['permission', 'revoked', 'password', 'duplicate', 'username', 'weak'])(
    'denies invalid creation: %s',
    async (mode) => {
      const f = fixture();
      f.state.allowed = mode !== 'permission';
      f.state.active = mode !== 'revoked';
      f.state.duplicate = mode === 'duplicate';
      await expect(
        f.service.create(
          'admin',
          'session',
          mode === 'password' ? 'wrong' : 'old-password',
          {
            username: mode === 'username' ? 'not valid' : 'created_user',
            ...(mode === 'weak' ? { temporaryPassword: 'weak' } : {}),
          },
          'origin',
          'request',
        ),
      ).rejects.toBeDefined();
    },
  );
  it('rechecks creator permission after hashing', async () => {
    const f = fixture();
    f.hasher.hash.mockImplementation(() => {
      f.state.allowed = false;
      return Promise.resolve('new-hash');
    });
    await expect(
      f.service.create('admin', 'session', 'old-password', { username: 'created_user' }, 'origin', 'request'),
    ).rejects.toBeDefined();
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO core.users'))).toBe(false);
  });
  it('consumes credentials and resumes ordered setup without granting ordinary sessions', async () => {
    const f = fixture();
    const proof = await f.service.begin('created_user', 'old-password', 'origin', 'request');
    expect(proof.token).toHaveLength(43);
    expect(f.user.credential_live).toBe(false);
    await expect(f.service.security(raw, answers, 'origin', 'request')).rejects.toBeDefined();
    await f.service.password(raw, password, password, 'origin', 'request');
    expect(await f.service.status(raw)).toEqual({ passwordSetupRequired: false, securitySetupRequired: true });
    await f.service.security(raw, answers, 'origin', 'request');
    expect(f.state.live).toBe(false);
    expect(f.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO core.session'))).toBe(false);
  });
  it.each(['missing', 'expired', 'banned', 'used', 'wrong'])(
    'rejects %s credential starts generically',
    async (mode) => {
      const f = fixture();
      f.state.found = mode !== 'missing';
      f.user.credential_live = mode !== 'expired';
      if (mode === 'banned') f.user.account_status = 'banned';
      if (mode === 'used') f.user.password_setup_required = false;
      await expect(
        f.service.begin('created_user', mode === 'wrong' ? 'wrong' : 'old-password', 'origin', 'request'),
      ).rejects.toMatchObject({ statusCode: 401 });
    },
  );
  it.each([undefined, 'bad'])('rejects malformed setup cookies before querying', async (token) => {
    const f = fixture();
    await expect(f.service.status(token)).rejects.toBeDefined();
    expect(f.query).not.toHaveBeenCalled();
  });
  it.each(['expired', 'binding', 'state'])('rejects %s setup grants', async (mode) => {
    const f = fixture();
    if (mode === 'expired') f.state.live = false;
    if (mode === 'binding') f.state.fingerprint = 'changed';
    if (mode === 'state') f.user.account_status = 'deactivated';
    await expect(f.service.status(raw)).rejects.toBeDefined();
  });
  it('requires a valid new password and five unique active questions', async () => {
    const f = fixture();
    await expect(f.service.password(raw, password, 'mismatch', 'origin', 'request')).rejects.toBeDefined();
    await f.service.password(raw, password, password, 'origin', 'request');
    await expect(f.service.security(raw, [], 'origin', 'request')).rejects.toBeDefined();
    f.state.catalogue = 4;
    await expect(f.service.security(raw, answers, 'origin', 'request')).rejects.toBeDefined();
  });
  it('fails closed when CAPTCHA enforcement is enabled', async () => {
    const f = fixture();
    f.config.captchaEnabled = true;
    await expect(f.service.begin('created_user', 'old-password', 'origin', 'request')).rejects.toMatchObject({
      statusCode: 503,
    });
    await expect(f.service.status(raw)).rejects.toMatchObject({ statusCode: 503 });
    await expect(
      f.service.create('admin', 'session', 'old-password', { username: 'created_user' }, 'origin', 'request'),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(f.query).not.toHaveBeenCalled();
  });
});
