import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createDb, initCluster, type Db } from '@boro-biya/db';
import { createDatabaseFor, injectedPgAdminUrl, type TestDatabaseHandle } from '@boro-biya/test-utils/pg';
import { makeCapturedLog, makeServerConfigFixture } from '@boro-biya/test-utils';
import { createLogger, createMetricsRegistry } from '@boro-biya/server-runtime';
import { buildApp } from '../../src/app.js';
import { createAuthService, type AuthService } from '../../src/auth/service.js';
import { readAuthConfig } from '../../src/auth/config.js';
import { administrativePermissions } from '../../src/auth/policy.js';
const config = readAuthConfig({
  SESSION_SECRET: 'disposable-administration-test-signing-material',
  WEB_ORIGIN: 'https://example.test',
  LOGIN_MAX_ATTEMPTS_PER_ACCOUNT: '100',
  LOGIN_MAX_ATTEMPTS_PER_ORIGIN: '300',
});
const password = 'Sailing!violet782';
let database: TestDatabaseHandle;
let db: Db;
let root: Db;
let app: FastifyInstance;
let auth: AuthService;
const ids: string[] = [];
let grants: Array<Awaited<ReturnType<AuthService['login']>>> = [];
let adminRole = '';
let userRole = '';
let serial = 0;
const capture = makeCapturedLog();
beforeAll(async () => {
  database = await createDatabaseFor(injectedPgAdminUrl(), 'administration');
  await initCluster({
    adminConnectionString: database.adminConnectionString,
    passwords: { core: 'admin-test-only', relation: 'admin-test-only', sos: 'admin-test-only' },
    repoRoot: resolve('.'),
  });
  root = createDb({ connectionString: database.adminConnectionString });
  const url = new URL(database.adminConnectionString);
  url.username = 'boro_core';
  url.password = 'admin-test-only';
  db = createDb({ connectionString: url.toString() });
  auth = await createAuthService(db, config);
  for (const username of ['first_admin', 'second_admin', 'target_user'])
    ids.push(
      (
        await auth.register(
          {
            username,
            password,
            repeatPassword: password,
            answers: [1, 2, 3, 4, 5].map((questionId) => ({ questionId, answer: 'private answer' })),
          },
          'fixture',
          'fixture',
        )
      ).id,
    );
  adminRole = (await db.pool.query<{ id: string }>("SELECT id FROM core.roles WHERE key = 'admin'")).rows[0]!.id;
  userRole = (await db.pool.query<{ id: string }>("SELECT id FROM core.roles WHERE key = 'user'")).rows[0]!.id;
  app = buildApp({
    config: makeServerConfigFixture(),
    auth,
    registry: createMetricsRegistry(),
    logger: createLogger({ service: 'api', version: 'test', commit: 'test', level: 'debug', sink: capture.sink }),
  });
});
beforeEach(async () => {
  await root.query(
    'TRUNCATE core.auth_buckets,core.audit_events,core.password_reset_challenges,core.account_setup_flows',
  );
  await root.query(
    "UPDATE core.users SET account_status = 'active', locked_until = NULL, state_reason = NULL, password_setup_required = false, security_setup_required = false",
  );
  await root.query('DELETE FROM core.user_roles');
  for (const id of ids) await root.query('INSERT INTO core.user_roles(user_id,role_id) VALUES ($1,$2)', [id, userRole]);
  for (const id of ids.slice(0, 2))
    await root.query('INSERT INTO core.user_roles(user_id,role_id) VALUES ($1,$2)', [id, adminRole]);
  await root.query(
    'INSERT INTO core.role_permissions(role_id,permission_id) SELECT $1,id FROM core.permissions ON CONFLICT DO NOTHING',
    [adminRole],
  );
  await root.query(
    "UPDATE core.session_families SET revoked_at = clock_timestamp(), revocation_reason = 'test' WHERE revoked_at IS NULL",
  );
  grants = [];
  for (const username of ['first_admin', 'second_admin', 'target_user'])
    grants.push(await auth.login(username, password, 'fixture', 'fixture'));
});
afterAll(async () => {
  await app?.close();
  await db?.close();
  await root?.close();
  await database?.drop();
});
function actor(index = 0) {
  return { userId: ids[index]!, sessionId: grants[index]!.sessionId };
}
function send(
  path: string,
  payload?: Record<string, unknown>,
  method: 'POST' | 'PATCH' | 'GET' = payload ? 'POST' : 'GET',
  index = 0,
) {
  return app.inject({
    url: `/api/v1/admin/${path}`,
    method,
    headers: { authorization: `Bearer ${grants[index]!.accessToken}` },
    ...(payload ? { payload } : {}),
  });
}
describe('administrative lifecycle and effective database permissions', () => {
  it('lists only credential-free projections, cursor-bounds users/audit and audits sensitive reads', async () => {
    expect((await send('users')).statusCode).toBe(200);
    expect((await send('roles')).statusCode).toBe(200);
    const detail = await send(`users/${ids[2]}`);
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ id: ids[2], roleIds: [userRole] });
    expect(detail.body).not.toContain('password_hash');
    expect((await send('audit-events')).statusCode).toBe(200);
    const text = (await send('users')).body;
    for (const field of ['password_hash', 'answer_hash', 'refresh_token', 'setupCredential'])
      expect(text).not.toContain(field);
    expect((await send('users?cursor=invalid')).statusCode).toBe(400);
    expect((await send('users?injected=true')).statusCode).toBe(400);
    expect((await send('audit-events')).json<{ items: unknown[] }>().items.length).toBeLessThanOrEqual(50);
  });
  it('denies ordinary users on every admin route and persists authorization failures', async () => {
    for (const [path, body, method] of [
      ['users', undefined, 'GET'],
      ['roles', undefined, 'GET'],
      ['audit-events', undefined, 'GET'],
      [`users/${ids[0]}/ban`, { currentPassword: password, reason: 'reason' }, 'POST'],
      [`users/${ids[0]}/roles`, { currentPassword: password, roleIds: [adminRole] }, 'PATCH'],
      ['roles', { currentPassword: password, key: 'illegal', nameKey: 'roles.illegal', permissions: [] }, 'POST'],
    ] as const)
      expect((await send(path, body, method, 2)).statusCode).toBe(403);
    expect(
      (await db.query("SELECT id FROM core.audit_events WHERE action = 'authorization_denied'")).rows.length,
    ).toBeGreaterThanOrEqual(6);
  });
  it('transitions lock/unlock, ban/unban and deactivate/reactivate with distinct audited state history', async () => {
    for (const action of ['lock', 'unlock', 'ban', 'unban', 'deactivate', 'reactivate']) {
      expect(
        (await send(`users/${ids[2]}/${action}`, { currentPassword: password, reason: `operator ${action}` }))
          .statusCode,
      ).toBe(200);
    }
    const events = await db.pool.query<{ action: string; details: { previous: string; next: string; source: string } }>(
      "SELECT action,details FROM core.audit_events WHERE target_id = $1 AND action IN ('account_lock','account_unlock','account_ban','account_unban','account_deactivate','account_reactivate') ORDER BY id",
      [ids[2]],
    );
    expect(events.rows.map((row) => row.details.next)).toEqual([
      'locked',
      'active',
      'banned',
      'active',
      'deactivated',
      'active',
    ]);
    for (const event of events.rows) expect(event.details.source).toBe('administrator');
    await expect(auth.authenticate(`Bearer ${grants[2]!.accessToken}`)).rejects.toBeDefined();
    await expect(auth.login('target_user', password, 'origin', 'new')).resolves.toMatchObject({ userId: ids[2] });
  });
  it('consumes refresh/recovery/setup proofs and preserves personal records on deactivation', async () => {
    const flow = await auth.recovery.forgot('target_user', 'origin', 'flow');
    const questions = await auth.recovery.questions(flow.token, 'origin', 'questions');
    const grant = await auth.recovery.verify(
      flow.token,
      questions.map((question) => ({ questionId: question.id, answer: 'private answer' })),
      'origin',
      'verify',
    );
    const before = (await db.query('SELECT question_id FROM core.user_security_answers WHERE user_id = $1', [ids[2]]))
      .rows;
    await auth.administration.state(
      actor(),
      ids[2]!,
      'deactivate',
      'requested lifecycle change',
      password,
      'origin',
      'state',
    );
    await expect(auth.refresh(grants[2]!.refreshToken, 'origin', 'refresh')).rejects.toBeDefined();
    await expect(
      auth.recovery.reset(flow.token, grant.token, 'Fresh!orchard762', 'Fresh!orchard762', 'origin', 'reset'),
    ).rejects.toBeDefined();
    expect(
      (await db.query('SELECT question_id FROM core.user_security_answers WHERE user_id = $1', [ids[2]])).rows,
    ).toEqual(before);
    expect((await db.query('SELECT id FROM core.users WHERE id = $1', [ids[2]])).rows).toHaveLength(1);
    await expect(db.query('DELETE FROM core.users WHERE id = $1', [ids[2]])).rejects.toBeDefined();
    expect((await send(`users/${ids[2]}`, {}, 'POST')).statusCode).toBe(404);
  });
  it('requires explicit legal transitions and non-empty reasons, rejects mass assignment and wrong passwords', async () => {
    expect((await send(`users/${ids[2]}/unban`, { currentPassword: password, reason: 'invalid' })).statusCode).toBe(
      409,
    );
    for (const body of [
      { currentPassword: password, reason: ' ' },
      { currentPassword: password, reason: 'valid', account_status: 'active' },
    ])
      expect((await send(`users/${ids[2]}/ban`, body)).statusCode).toBe(400);
    expect((await send(`users/${ids[2]}/ban`, { currentPassword: 'wrong', reason: 'valid' })).statusCode).toBe(401);
    expect((await send('users/not-a-uuid/ban', { currentPassword: password, reason: 'valid' })).statusCode).toBe(400);
  });
  it.each(['lock', 'ban', 'deactivate'] as const)(
    'protects the sole full administrator from %s and persists the denied audit',
    async (action) => {
      await root.query('DELETE FROM core.user_roles WHERE user_id = $1 AND role_id = $2', [ids[1], adminRole]);
      await expect(
        auth.administration.state(
          actor(),
          ids[0]!,
          action,
          'cannot remove last administrator',
          password,
          'origin',
          'last',
        ),
      ).rejects.toMatchObject({ statusCode: 409 });
      await expect(auth.authenticate(`Bearer ${grants[0]!.accessToken}`)).resolves.toMatchObject({ userId: ids[0] });
      const denied = await db.pool.query<{ target_id: string; details: { previous: string; next: string } }>(
        "SELECT target_id,details FROM core.audit_events WHERE action = 'last_administrator_change_denied'",
      );
      expect(denied.rows[0]?.target_id).toBe(ids[0]);
      expect(denied.rows[0]?.details.previous).toBe('active');
    },
  );
  it('protects the last administrator from demotion and permission edits, even across roles', async () => {
    await root.query('DELETE FROM core.user_roles WHERE user_id = $1 AND role_id = $2', [ids[1], adminRole]);
    await expect(
      auth.administration.assignRoles(actor(), ids[0]!, [userRole], password, 'origin', 'demote'),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      auth.administration.saveRole(
        actor(),
        adminRole,
        { nameKey: 'roles.admin', permissions: ['users.read'] },
        password,
        'origin',
        'strip',
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await auth.permissions(ids[0]!)).toHaveLength(administrativePermissions.length);
  });
  it('serializes competing demotions so exactly one full administrator remains', async () => {
    const outcomes = await Promise.allSettled([
      auth.administration.assignRoles(actor(0), ids[1]!, [userRole], password, 'origin', 'one'),
      auth.administration.assignRoles(actor(1), ids[0]!, [userRole], password, 'origin', 'two'),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const counts = await Promise.all([auth.permissions(ids[0]!), auth.permissions(ids[1]!)]);
    expect(counts.filter((permissions) => permissions.length === administrativePermissions.length)).toHaveLength(1);
  });
  it('counts full administrative permissions carried by a custom role, not the seeded admin name', async () => {
    const custom = await auth.administration.saveRole(
      actor(),
      undefined,
      { key: `full_${++serial}`, nameKey: 'roles.custom', permissions: [...administrativePermissions] },
      password,
      'origin',
      'create',
    );
    await auth.administration.assignRoles(actor(), ids[2]!, [custom.id], password, 'origin', 'grant');
    await auth.administration.assignRoles(actor(), ids[1]!, [userRole], password, 'origin', 'demote_other');
    await auth.administration.assignRoles(actor(), ids[0]!, [userRole], password, 'origin', 'demote_self');
    expect((await send('users', undefined, 'GET', 0)).statusCode).toBe(403);
    expect((await send('users', undefined, 'GET', 2)).statusCode).toBe(200);
  });
  it('applies role edits to existing sessions immediately, rejects unknown/duplicate grants and audits previous/new values', async () => {
    const created = await send('roles', {
      key: `limited_${++serial}`,
      nameKey: 'roles.limited',
      permissions: ['users.read'],
      currentPassword: password,
    });
    expect(created.statusCode).toBe(201);
    const roleId = created.json<{ id: string }>().id;
    expect(
      (await send(`users/${ids[2]}/roles`, { roleIds: [roleId], currentPassword: password }, 'PATCH')).statusCode,
    ).toBe(200);
    expect((await send('users', undefined, 'GET', 2)).statusCode).toBe(200);
    expect(
      (await send(`roles/${roleId}`, { nameKey: 'roles.limited', permissions: [], currentPassword: password }, 'PATCH'))
        .statusCode,
    ).toBe(200);
    expect((await send('users', undefined, 'GET', 2)).statusCode).toBe(403);
    expect(
      (await send(`users/${ids[2]}/roles`, { roleIds: [roleId, roleId], currentPassword: password }, 'PATCH'))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await send('roles', {
          key: 'bad_permission',
          nameKey: 'roles.invalid',
          permissions: ['users.delete'],
          currentPassword: password,
        })
      ).statusCode,
    ).toBe(400);
    expect((await db.query("SELECT details FROM core.audit_events WHERE action = 'role_changed'")).rows).toHaveLength(
      1,
    );
  });
  it.each(['locked', 'banned', 'deactivated', 'password', 'security'])(
    'rejects %s callers across administrative reads and mutations',
    async (state) => {
      await root.query(
        "UPDATE core.users SET account_status = $2, state_reason = 'test', locked_until = CASE WHEN $2 = 'locked' THEN clock_timestamp() + interval '1 hour' ELSE NULL END,password_setup_required = $3,security_setup_required = $4 WHERE id = $1",
        [
          ids[0],
          ['password', 'security'].includes(state) ? 'active' : state,
          state === 'password',
          state === 'security',
        ],
      );
      for (const path of ['users', 'roles', 'audit-events', `users/${ids[2]}`])
        expect((await send(path)).statusCode).toBe(401);
      expect((await send(`users/${ids[2]}/ban`, { currentPassword: password, reason: 'test' })).statusCode).toBe(401);
      expect(
        (await send(`users/${ids[2]}/roles`, { roleIds: [], currentPassword: password }, 'PATCH')).statusCode,
      ).toBe(401);
      expect(
        (
          await send('roles', {
            key: 'denied_role',
            nameKey: 'roles.denied',
            permissions: [],
            currentPassword: password,
          })
        ).statusCode,
      ).toBe(401);
    },
  );
  it('rolls back state, proof invalidation and revocation if audit persistence fails', async () => {
    await root.query(
      "CREATE FUNCTION core.reject_admin_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'disposable failure'; END $$",
    );
    await root.query(
      "CREATE TRIGGER reject_admin_audit BEFORE INSERT ON core.audit_events FOR EACH ROW WHEN (NEW.action = 'account_ban') EXECUTE FUNCTION core.reject_admin_audit()",
    );
    try {
      await expect(
        auth.administration.state(actor(), ids[2]!, 'ban', 'audit rollback', password, 'origin', 'failed'),
      ).rejects.toBeDefined();
      await expect(auth.authenticate(`Bearer ${grants[2]!.accessToken}`)).resolves.toMatchObject({ userId: ids[2] });
    } finally {
      await root.query('DROP TRIGGER reject_admin_audit ON core.audit_events');
      await root.query('DROP FUNCTION core.reject_admin_audit()');
    }
    expect(capture.raw.join('')).not.toContain(password);
  });
});

it('revokes restricted setup proofs on deactivation without erasing setup flags', async () => {
  const created = await auth.setup.create(
    ids[0]!,
    grants[0]!.sessionId,
    password,
    { username: `pending_${++serial}` },
    'origin',
    'create',
  );
  const proof = await auth.setup.begin(created.username, created.setupCredential!, 'origin', 'begin');
  await auth.administration.state(
    actor(),
    created.id,
    'deactivate',
    'review setup access',
    password,
    'origin',
    'disable',
  );
  await expect(auth.setup.status(proof.token)).rejects.toBeDefined();
  await auth.administration.state(actor(), created.id, 'reactivate', 'review completed', password, 'origin', 'enable');
  await expect(auth.setup.status(proof.token)).rejects.toBeDefined();
  const state = await db.pool.query<{ password_setup_required: boolean; security_setup_required: boolean }>(
    'SELECT password_setup_required,security_setup_required FROM core.users WHERE id = $1',
    [created.id],
  );
  expect(state.rows[0]).toEqual({ password_setup_required: true, security_setup_required: true });
});
it('uses disjoint cursor pages for users, roles and audit events', async () => {
  await root.query(
    "INSERT INTO core.users(username_normalized,username_display,password_hash,password_setup_required,security_setup_required) SELECT 'page_user_' || n,'page_user_' || n,(SELECT password_hash FROM core.users WHERE id = $1),false,false FROM generate_series(1,55) n",
    [ids[2]],
  );
  await root.query(
    "INSERT INTO core.roles(key,name_key) SELECT 'page_role_' || n,'roles.page' FROM generate_series(1,55) n",
  );
  await root.query(
    "INSERT INTO core.audit_events(actor_type,action,target_type,request_id) SELECT 'system','page_event','audit','page' FROM generate_series(1,55)",
  );
  for (const path of ['users', 'roles', 'audit-events']) {
    const first = (await send(path)).json<{ items: Array<{ id: string }>; nextCursor: string }>();
    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).toBeTruthy();
    const next = (await send(`${path}?cursor=${first.nextCursor}`)).json<{ items: Array<{ id: string }> }>();
    expect(next.items.length).toBeGreaterThan(0);
    const seen = new Set(first.items.map((item) => item.id));
    expect(next.items.some((item) => seen.has(item.id))).toBe(false);
  }
});
