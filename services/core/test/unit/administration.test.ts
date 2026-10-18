import { describe, expect, it, vi } from 'vitest';
import type { Db } from '@boro-biya/db';
import { createAdministration } from '../../src/auth/administration.js';
import { readAuthConfig } from '../../src/auth/config.js';
const actor = { userId: 'actor', sessionId: 'session' };
function fixture() {
  const state = {
    active: true,
    permission: true,
    fullAdmin: true,
    found: true,
    status: 'active',
    password: 'encoded',
    validRoles: true,
    roleExists: true,
    pending: true,
    issued: true,
  };
  const query = vi.fn(
    async (sql: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> => {
      await Promise.resolve();
      if (sql.startsWith('SELECT password_hash')) return { rows: [{ password_hash: state.password }], rowCount: 1 };
      if (sql.includes('SELECT s.id FROM')) return { rows: [], rowCount: state.active ? 1 : 0 };
      if (sql.startsWith('SELECT 1 FROM core.user_roles')) return { rows: [], rowCount: state.permission ? 1 : 0 };
      if (sql.startsWith('SELECT u.id FROM')) return { rows: [], rowCount: state.fullAdmin ? 1 : 0 };
      if (sql.startsWith('SELECT account_status'))
        return {
          rows: state.found
            ? [
                {
                  account_status: state.status,
                  username_normalized: 'target',
                  username_display: 'Target',
                  password_setup_required: false,
                  security_setup_required: state.pending,
                  setup_credential_expires_at: state.issued ? new Date() : null,
                },
              ]
            : [],
          rowCount: state.found ? 1 : 0,
        };
      if (sql.startsWith('UPDATE core.users SET password_hash'))
        return { rows: [{ setup_credential_expires_at: new Date('2026-10-18T12:00:00Z') }], rowCount: 1 };
      if (sql.startsWith('SELECT id FROM core.users WHERE')) return { rows: [], rowCount: state.found ? 1 : 0 };
      if (sql.startsWith('SELECT id FROM core.roles WHERE'))
        return { rows: [], rowCount: state.validRoles ? (params[0] as unknown[]).length : 0 };
      if (sql.startsWith('SELECT role_id')) return { rows: [{ role_id: 'old-role' }], rowCount: 1 };
      if (sql.startsWith('SELECT id FROM core.permissions'))
        return { rows: (params[0] as string[]).map((id) => ({ id })), rowCount: (params[0] as string[]).length };
      if (sql.startsWith('INSERT INTO core.roles'))
        return { rows: state.roleExists ? [{ id: 'new-role' }] : [], rowCount: state.roleExists ? 1 : 0 };
      if (sql.startsWith('SELECT r.key'))
        return {
          rows: state.roleExists ? [{ key: 'custom', name_key: 'roles.custom', permissions: [] }] : [],
          rowCount: state.roleExists ? 1 : 0,
        };
      if (sql.startsWith('SELECT action, target_type'))
        return {
          rows: [
            {
              action: 'account_ban',
              target_type: 'user',
              target_id: 'target',
              details: { previous: 'active', next: 'banned' },
            },
          ],
          rowCount: 1,
        };
      return { rows: [], rowCount: 1 };
    },
  );
  const release = vi.fn();
  const db = { pool: { query, connect: vi.fn().mockResolvedValue({ query, release }) } } as unknown as Pick<Db, 'pool'>;
  const hasher = { hash: vi.fn().mockResolvedValue('new'), verify: vi.fn().mockResolvedValue(true) };
  const reserve = vi.fn().mockResolvedValue(undefined);
  return {
    state,
    query,
    hasher,
    reserve,
    service: createAdministration(
      db,
      readAuthConfig({
        SESSION_SECRET: 'disposable-administration-unit-secret-material',
        WEB_ORIGIN: 'https://example.test',
      }),
      hasher,
      'dummy',
      reserve,
    ),
  };
}
describe('central administrative orchestration', () => {
  it('audits and returns bounded credential-free read projections', async () => {
    const f = fixture();
    expect(await f.service.users(actor, 'read')).toEqual({ items: [], nextCursor: null });
    expect((await f.service.roles(actor, 'read')).items).toEqual([]);
    expect(await f.service.auditEvents(actor, 'read')).toEqual({ items: [], nextCursor: null });
  });
  it.each(['active', 'permission'])('rejects a caller without %s authorization', async (mode) => {
    const f = fixture();
    if (mode === 'active') f.state.active = false;
    else f.state.permission = false;
    await expect(f.service.users(actor, 'denied')).rejects.toMatchObject({ statusCode: mode === 'active' ? 401 : 403 });
    if (mode === 'permission')
      expect(f.query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO core.audit_events'))).toBe(true);
  });
  it('transitions and revokes credentials under the administrative lock', async () => {
    const f = fixture();
    await f.service.state(actor, 'target', 'ban', 'reason', 'password', 'origin', 'request');
    const statements = f.query.mock.calls.map(([sql]) => sql).join('\n');
    expect(statements).toContain('pg_advisory_xact_lock');
    expect(statements).toContain('UPDATE core.session_families');
    expect(statements).toContain('UPDATE core.account_setup_flows');
    expect(statements).toContain('UPDATE core.password_reset_challenges');
    expect(f.query).toHaveBeenCalledWith('COMMIT');
  });
  it('clears account budgets on activation without clearing origin budgets', async () => {
    const f = fixture();
    f.state.status = 'locked';
    await f.service.state(actor, 'target', 'unlock', 'reason', 'password', 'origin', 'request');
    expect(f.query.mock.calls.filter(([sql]) => sql.startsWith('UPDATE core.auth_buckets'))).toHaveLength(2);
  });
  it.each(['target', 'transition', 'password'])('denies invalid state mutation: %s', async (mode) => {
    const f = fixture();
    if (mode === 'target') f.state.found = false;
    if (mode === 'transition') f.state.status = 'banned';
    if (mode === 'password') f.hasher.verify.mockResolvedValue(false);
    await expect(
      f.service.state(actor, 'target', 'lock', 'reason', 'password', 'origin', 'request'),
    ).rejects.toBeDefined();
  });
  it('rolls back a last-administrator change while committing its denied audit', async () => {
    const f = fixture();
    f.state.fullAdmin = false;
    await expect(
      f.service.state(actor, 'target', 'ban', 'reason', 'password', 'origin', 'request'),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(f.query).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT administrative_change');
    expect(f.query).toHaveBeenCalledWith('COMMIT');
    const audits = f.query.mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO core.audit_events'));
    expect(audits.at(-1)?.[1]).toContain('last_administrator_change_denied');
  });
  it('assigns a validated role set with previous and new values', async () => {
    const f = fixture();
    await f.service.assignRoles(actor, 'target', ['new-role'], 'password', 'origin', 'request');
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('DELETE FROM core.user_roles'))).toBe(true);
  });
  it('rejects unknown role references before deleting assignments', async () => {
    const f = fixture();
    f.state.validRoles = false;
    await expect(
      f.service.assignRoles(actor, 'target', ['unknown'], 'password', 'origin', 'request'),
    ).rejects.toBeDefined();
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('DELETE FROM core.user_roles'))).toBe(false);
  });
  it.each([undefined, 'role-id'])('creates/updates role permissions as data: %s', async (id) => {
    const f = fixture();
    expect(
      await f.service.saveRole(
        actor,
        id,
        { key: 'custom', nameKey: 'roles.custom', permissions: ['users.read'] },
        'password',
        'origin',
        'request',
      ),
    ).toHaveProperty('id');
  });
  it.each([undefined, 'missing-role'])('rejects duplicate or missing roles: %s', async (id) => {
    const f = fixture();
    f.state.roleExists = false;
    await expect(
      f.service.saveRole(
        actor,
        id,
        { key: 'custom', nameKey: 'roles.custom', permissions: [] },
        'password',
        'origin',
        'request',
      ),
    ).rejects.toBeDefined();
  });
  it('stops before work when admission is denied', async () => {
    const f = fixture();
    f.reserve.mockRejectedValue(new Error('limited'));
    await expect(f.service.assignRoles(actor, 'target', [], 'password', 'origin', 'request')).rejects.toThrow(
      'limited',
    );
    expect(f.query).not.toHaveBeenCalled();
  });
});

it.each(['password', 'revoked', 'permission'])(
  'rechecks %s after asynchronous current-password verification',
  async (mode) => {
    const f = fixture();
    f.hasher.verify.mockImplementation(() => {
      if (mode === 'password') f.state.password = 'rotated';
      if (mode === 'revoked') f.state.active = false;
      if (mode === 'permission') f.state.permission = false;
      return Promise.resolve(true);
    });
    await expect(f.service.state(actor, 'target', 'ban', 'reason', 'password', 'origin', 'race')).rejects.toBeDefined();
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE core.users SET'))).toBe(false);
  },
);

describe('pending setup credential reissuance orchestration', () => {
  it('reserves before hashing, writes only the native hash, revokes proofs and audits no secrets', async () => {
    const f = fixture();
    const result = await f.service.reissueSetupCredential(
      actor,
      'target',
      'lost proof',
      'password',
      'origin',
      'reissue',
    );
    expect(result.setupCredential).toMatch(/^[A-Za-z0-9_-]{43}!9$/);
    expect(f.hasher.hash).toHaveBeenCalledWith(result.setupCredential);
    expect(
      f.query.mock.calls.some(
        ([sql]) =>
          sql.startsWith('SELECT account_status, username_normalized, username_display') && sql.endsWith('FOR UPDATE'),
      ),
    ).toBe(true);
    expect(f.reserve).toHaveBeenCalledWith('admin-mutation-account', 'actor', expect.any(Number), 'reissue');
    const update = f.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE core.users SET password_hash'));
    expect(update?.[1]).toEqual(['target', 'new']);
    const audit = f.query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO core.audit_events'));
    expect(JSON.stringify(audit)).toContain('lost proof');
    expect(JSON.stringify(audit)).not.toContain(result.setupCredential);
    expect(f.query.mock.calls.filter(([sql]) => sql.startsWith('UPDATE core.auth_buckets'))).toHaveLength(2);
  });
  it.each(['missing', 'completed', 'unissued', 'inactive'] as const)(
    'rejects an ineligible %s target before replacement hashing',
    async (mode) => {
      const f = fixture();
      if (mode === 'missing') f.state.found = false;
      else if (mode === 'completed') f.state.pending = false;
      else if (mode === 'unissued') f.state.issued = false;
      else f.state.status = 'banned';
      await expect(
        f.service.reissueSetupCredential(actor, 'target', 'reason', 'password', 'origin', 'reissue'),
      ).rejects.toMatchObject({ statusCode: mode === 'missing' ? 404 : 409 });
      expect(f.hasher.hash).not.toHaveBeenCalled();
      expect(f.query).toHaveBeenCalledWith('ROLLBACK');
    },
  );
  it('denies a limited mutation before password verification or target hashing', async () => {
    const f = fixture();
    f.reserve.mockRejectedValueOnce(Object.assign(new Error('quota'), { statusCode: 429 }));
    await expect(
      f.service.reissueSetupCredential(actor, 'target', 'reason', 'password', 'origin', 'limited'),
    ).rejects.toMatchObject({ statusCode: 429 });
    expect(f.hasher.verify).not.toHaveBeenCalled();
    expect(f.hasher.hash).not.toHaveBeenCalled();
  });
});

it('binds administrative search values as SQL parameters and never interpolates user input', async () => {
  const f = fixture();
  const username = "' OR TRUE --";
  await f.service.users(actor, 'search', {
    username,
    status: 'active',
    setupRequired: 'false',
    roleId: 'role',
    cursor: 'cursor',
  });
  const userQuery = f.query.mock.calls.find(([sql]) => sql.includes('strpos(username_normalized'))!;
  expect(userQuery[0]).not.toContain(username);
  expect(userQuery[1]).toEqual(['cursor', username, 'active', false, 'role']);
  await f.service.auditEvents(actor, 'audit', {
    actorId: 'actor',
    action: 'action',
    targetId: 'target',
    targetType: 'user',
    from: '2026-10-17T00:00:00Z',
    to: '2026-10-18T00:00:00Z',
  });
  const auditQuery = f.query.mock.calls.find(([sql]) => sql.includes('created_at >= $6'))!;
  expect(auditQuery[1]).toEqual([
    null,
    'actor',
    'action',
    'target',
    'user',
    '2026-10-17T00:00:00Z',
    '2026-10-18T00:00:00Z',
  ]);
});
