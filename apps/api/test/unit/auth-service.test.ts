import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@boro-biya/db';
import { createAuthService } from '../../src/auth/service.js';
import type { AuthConfig } from '../../src/auth/config.js';

const mocks = vi.hoisted(() => ({ create: vi.fn(), find: vi.fn(), issue: vi.fn(), rotate: vi.fn(), active: vi.fn() }));
vi.mock('../../src/identity/repository.js', () => ({
  createIdentityRepository: () => ({ create: mocks.create, findById: mocks.find }),
}));
vi.mock('../../src/identity/sessions.js', () => ({
  createSessionRepository: () => ({ issue: mocks.issue, rotate: mocks.rotate, isActive: mocks.active }),
}));
const config: AuthConfig = {
  secret: 'disposable-service-test-only-material',
  origin: 'https://example.test',
  secureCookies: true,
  accessTtlSeconds: 900,
  refreshTtlSeconds: 86400,
  maxAccountAttempts: 10,
  maxOriginAttempts: 30,
  windowSeconds: 900,
  lockoutSeconds: 900,
  recoveryEnabled: true,
  captchaEnabled: false,
};
const account = {
  id: 'user',
  username: 'alice',
  status: 'active',
  passwordSetupRequired: false,
  securitySetupRequired: false,
};
const grant = {
  userId: 'user',
  sessionId: 'session',
  familyId: 'family',
  refreshToken: 'secret',
  expiresAt: new Date('2030-01-01'),
};
const registration = {
  username: 'alice',
  password: 'Sailing!violet782',
  repeatPassword: 'Sailing!violet782',
  answers: [1, 2, 3, 4, 5].map((questionId) => ({ questionId, answer: 'answer' })),
};
function fixture(overrides: Partial<AuthConfig> = {}) {
  let limit = 0;
  let found = true;
  let failed = 1;
  const query = vi.fn(async (sql: string) => {
    await Promise.resolve();
    if (sql.includes('SELECT user_id, family_id'))
      return { rows: found ? [{ user_id: 'user', family_id: 'family' }] : [], rowCount: found ? 1 : 0 };
    if (sql.includes('cardinality')) return { rows: [{ count: limit }], rowCount: 1 };
    if (sql.includes('SELECT password_hash'))
      return {
        rows: found ? [{ password_hash: '$argon2id$fixture', username_normalized: 'alice' }] : [],
        rowCount: found ? 1 : 0,
      };
    if (sql.includes('SELECT id, password_hash'))
      return { rows: found ? [{ id: 'user', password_hash: '$argon2id$fixture' }] : [], rowCount: found ? 1 : 0 };
    if (sql.includes('RETURNING failed_login_count')) return { rows: [{ failed_login_count: failed }], rowCount: 1 };
    if (sql.includes('SELECT id, text_key')) return { rows: [{ id: 1, text_key: 'question' }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
  const release = vi.fn();
  const connect = vi.fn().mockResolvedValue({ query, release });
  const db = { pool: { query, connect } } as unknown as Pick<Db, 'pool'>;
  const hasher = { hash: vi.fn().mockResolvedValue('$argon2id$fixture'), verify: vi.fn().mockResolvedValue(true) };
  return {
    query,
    hasher,
    service: () => createAuthService(db, { ...config, ...overrides }, hasher),
    limit: (n: number) => {
      limit = n;
    },
    found: (v: boolean) => {
      found = v;
    },
    failed: (n: number) => {
      failed = n;
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue(account);
  mocks.find.mockResolvedValue(account);
  mocks.issue.mockResolvedValue(grant);
  mocks.rotate.mockResolvedValue(grant);
  mocks.active.mockResolvedValue(true);
});

describe('auth orchestration and failure boundaries', () => {
  it('registers only validated normalized credentials, hashes answers sequentially and includes audit context', async () => {
    const f = fixture();
    const service = await f.service();
    expect(await service.register(registration, 'origin', 'req')).toEqual(account);
    expect(mocks.create.mock.calls[0]?.[0]).toMatchObject({
      username: 'alice',
      auditRequestId: 'req',
      securitySetupRequired: false,
    });
    expect(f.hasher.hash).toHaveBeenCalledTimes(7);
    expect(await service.catalogue()).toEqual([{ id: 1, textKey: 'question' }]);
  });
  it.each([
    { repeatPassword: 'wrong' },
    { password: 'short', repeatPassword: 'short' },
    { username: 'a' },
    { answers: [] },
    { answers: [1, 1, 2, 3, 4].map((questionId) => ({ questionId, answer: 'answer' })) },
    { answers: [1, 2, 3, 4, 5].map((questionId) => ({ questionId, answer: '' })) },
  ])('rejects invalid registration before hashing %j', async (patch) => {
    const f = fixture();
    const service = await f.service();
    await expect(service.register({ ...registration, ...patch }, 'origin', 'req')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each([
    { code: '23505' },
    { code: '23503' },
    new Error('security question unavailable'),
    new Error('secret database detail'),
  ])('sanitizes storage failures', async (error) => {
    const service = await fixture().service();
    mocks.create.mockRejectedValueOnce(error);
    await expect(service.register(registration, 'origin', 'req')).rejects.not.toThrow('secret database detail');
  });
  it('fails closed when enabled CAPTCHA has not yet been implemented, and denies persisted rate limits', async () => {
    const f = fixture({ captchaEnabled: true });
    const service = await f.service();
    await expect(service.register(registration, 'origin', 'req')).rejects.toMatchObject({ statusCode: 503 });
    await expect(service.login('alice', 'password', 'origin', 'req')).rejects.toMatchObject({ statusCode: 503 });
    const g = fixture();
    g.limit(30);
    await expect((await g.service()).register(registration, 'origin', 'req')).rejects.toMatchObject({
      statusCode: 429,
    });
  });
  it('checks a password snapshot at issuance and signs a grant only after current state passes', async () => {
    const f = fixture();
    const service = await f.service();
    const result = await service.login('ALICE', 'password', 'origin', 'req');
    expect(result.accessToken).toContain('.');
    expect(mocks.issue).toHaveBeenCalledWith('user', '$argon2id$fixture');
    mocks.issue.mockResolvedValueOnce(null);
    await expect(service.login('alice', 'password', 'origin', 'req')).rejects.toMatchObject({ statusCode: 401 });
  });
  it('uses dummy verification for unknown/malformed usernames and locks/revokes at the bounded threshold', async () => {
    const f = fixture();
    const service = await f.service();
    f.found(false);
    await expect(service.login('a', 'password', 'origin', 'req')).rejects.toMatchObject({ statusCode: 401 });
    f.found(true);
    f.hasher.verify.mockResolvedValue(false);
    f.failed(1);
    await expect(service.login('alice', 'password', 'origin', 'req')).rejects.toMatchObject({ statusCode: 401 });
    f.failed(10);
    await expect(service.login('alice', 'password', 'origin', 'req')).rejects.toMatchObject({ statusCode: 401 });
    expect(f.query.mock.calls.some(([sql]) => sql.includes("revocation_reason = 'account_locked'"))).toBe(true);
  });
  it('authenticates signature and current state, rejecting missing/malformed/revoked claims', async () => {
    const f = fixture();
    const service = await f.service();
    const token = await service.tokens.sign('user', 'session');
    expect((await service.authenticate(`Bearer ${token}`)).account).toEqual(account);
    for (const header of [undefined, 'Basic no', 'Bearer invalid'])
      await expect(service.authenticate(header)).rejects.toMatchObject({ statusCode: 401 });
    mocks.active.mockResolvedValueOnce(false);
    await expect(service.authenticate(`Bearer ${token}`)).rejects.toMatchObject({ statusCode: 401 });
    mocks.find.mockResolvedValueOnce(null);
    await expect(service.authenticate(`Bearer ${token}`)).rejects.toMatchObject({ statusCode: 401 });
  });
  it('changes only a freshly verified current password and revokes all families atomically', async () => {
    const f = fixture();
    const service = await f.service();
    await service.changePassword('user', 'old password', 'Another!violet42', 'Another!violet42', 'req');
    expect(f.query.mock.calls.some(([sql]) => sql.includes("revocation_reason = 'password_changed'"))).toBe(true);
    await expect(service.changePassword('user', 'old password', 'short', 'short', 'req')).rejects.toMatchObject({
      statusCode: 400,
    });
    f.hasher.verify.mockResolvedValueOnce(false);
    await expect(
      service.changePassword('user', 'wrong', 'Another!violet42', 'Another!violet42', 'req'),
    ).rejects.toMatchObject({ statusCode: 401 });
    f.found(false);
    await expect(
      service.changePassword('user', 'wrong', 'Another!violet42', 'Another!violet42', 'req'),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('refreshes and commits revoke-current/revoke-others audit operations', async () => {
    const f = fixture();
    const service = await f.service();
    expect((await service.refresh('secret', 'origin', 'req')).accessToken).toContain('.');
    mocks.rotate.mockResolvedValueOnce(null);
    await expect(service.refresh('secret', 'origin', 'req')).rejects.toMatchObject({ statusCode: 401 });
    await service.logout('r'.repeat(43), 'req');
    await service.logout(undefined, 'req');
    await service.logout('invalid', 'req');
    f.found(false);
    await service.logout('r'.repeat(43), 'req');
    await service.revokeOthers('user', 'session', 'req');
    expect(f.query.mock.calls.filter(([sql]) => sql === 'COMMIT').length).toBeGreaterThan(2);
  });
});
