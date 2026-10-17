import { createHmac } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createDb, initCluster, type Db } from '@boro-biya/db';
import { createDatabaseFor, injectedPgAdminUrl, type TestDatabaseHandle } from '@boro-biya/test-utils/pg';
import { makeCapturedLog, makeServerConfigFixture } from '@boro-biya/test-utils';
import { createLogger, createMetricsRegistry } from '@boro-biya/server-runtime';
import { createAuthService, type AuthService } from '../../src/auth/service.js';
import { readAuthConfig } from '../../src/auth/config.js';
import { buildApp } from '../../src/app.js';
const config = readAuthConfig({
  SESSION_SECRET: 'disposable-setup-integration-signing-material',
  WEB_ORIGIN: 'https://example.test',
  LOGIN_MAX_ATTEMPTS_PER_ACCOUNT: '100',
  LOGIN_MAX_ATTEMPTS_PER_ORIGIN: '300',
});
const password = 'Sailing!violet782';
const freshPassword = 'Fresh!orchard762';
const answers = [1, 2, 3, 4, 5].map((questionId) => ({ questionId, answer: `private setup answer ${questionId}` }));
let database: TestDatabaseHandle;
let db: Db;
let adminDb: Db;
let auth: AuthService;
let app: FastifyInstance;
let actorId = '';
let csrf = '';
let actorToken = '';
let actorSession = '';
let serial = 0;
const capture = makeCapturedLog();
beforeAll(async () => {
  database = await createDatabaseFor(injectedPgAdminUrl(), 'setup');
  await initCluster({
    adminConnectionString: database.adminConnectionString,
    passwords: { core: 'setup-test-only', relation: 'setup-test-only', sos: 'setup-test-only' },
    repoRoot: resolve('.'),
  });
  adminDb = createDb({ connectionString: database.adminConnectionString });
  const url = new URL(database.adminConnectionString);
  url.username = 'boro_core';
  url.password = 'setup-test-only';
  db = createDb({ connectionString: url.toString() });
  auth = await createAuthService(db, config);
  actorId = (
    await auth.register({ username: 'operator', password, repeatPassword: password, answers }, 'fixture', 'fixture')
  ).id;
  app = buildApp({
    config: makeServerConfigFixture(),
    auth,
    registry: createMetricsRegistry(),
    logger: createLogger({ service: 'api', version: 'test', commit: 'test', level: 'debug', sink: capture.sink }),
  });
  csrf = (await app.inject('/api/v1/auth/csrf')).json<{ csrfToken: string }>().csrfToken;
});
beforeEach(async () => {
  await adminDb.query('TRUNCATE core.auth_buckets');
  await adminDb.query(
    "INSERT INTO core.user_roles(user_id, role_id) SELECT $1, id FROM core.roles WHERE key = 'admin' ON CONFLICT DO NOTHING",
    [actorId],
  );
  const grant = await auth.login('operator', password, 'fixture', 'fixture');
  actorToken = grant.accessToken;
  actorSession = grant.sessionId;
});
afterAll(async () => {
  await app?.close();
  await db?.close();
  await adminDb?.close();
  await database?.drop();
});
async function create(temporaryPassword?: string) {
  const username = `created_${++serial}`;
  return auth.setup.create(
    actorId,
    actorSession,
    password,
    { username, ...(temporaryPassword === undefined ? {} : { temporaryPassword }) },
    'origin',
    'create',
  );
}
function request(path: string, cookie?: string, payload?: Record<string, unknown>) {
  return app.inject({
    method: payload === undefined ? 'GET' : 'POST',
    url: `/api/v1/auth/setup/${path}`,
    headers: {
      origin: config.origin,
      cookie: `boro_csrf=${csrf}${cookie ? `; __Host-boro_setup=${cookie}` : ''}`,
      'x-csrf-token': csrf,
    },
    ...(payload === undefined ? {} : { payload }),
  });
}
describe('admin-created accounts and restricted first sign-in', () => {
  it('requires database permission and current-password confirmation for creation', async () => {
    await adminDb.query(
      "DELETE FROM core.user_roles WHERE user_id = $1 AND role_id IN (SELECT id FROM core.roles WHERE key = 'admin')",
      [actorId],
    );
    await expect(create()).rejects.toMatchObject({ statusCode: 403 });
    await adminDb.query(
      "INSERT INTO core.user_roles(user_id, role_id) SELECT $1, id FROM core.roles WHERE key = 'admin'",
      [actorId],
    );
    await expect(
      auth.setup.create(actorId, actorSession, 'wrong', { username: 'denied' }, 'origin', 'denied'),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
  it('returns generated credentials once, seeds only the user role, and performs every setup step over HTTP', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: { authorization: `Bearer ${actorToken}` },
      payload: { username: `created_${++serial}`, currentPassword: password },
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const created = response.json<{ id: string; username: string; setupCredential: string; expiresAt: string }>();
    expect(created.setupCredential).toHaveLength(45);
    expect(await auth.roles(created.id)).toEqual(['user']);
    await expect(auth.login(created.username, created.setupCredential, 'origin', 'normal')).rejects.toBeDefined();
    const view = await app.inject({
      url: `/api/v1/admin/users/${created.id}`,
      headers: { authorization: `Bearer ${actorToken}` },
    });
    expect(view.statusCode).toBe(200);
    expect(view.json()).not.toHaveProperty('setupCredential');
    expect(view.body).not.toContain('password_hash');
    const begin = await request('start', undefined, { username: created.username, password: created.setupCredential });
    expect(begin.statusCode).toBe(200);
    expect(begin.json()).toEqual({ accepted: true });
    const setCookie = String(begin.headers['set-cookie']);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Secure');
    const proof = /^__Host-boro_setup=([^;]+)/.exec(setCookie)?.[1];
    if (!proof) throw new Error('missing proof');
    const stored = await db.pool.query<{ token_hash: string }>(
      'SELECT token_hash FROM core.account_setup_flows WHERE user_id = $1',
      [created.id],
    );
    expect(stored.rows[0]?.token_hash).not.toBe(proof);
    expect((await request('status', proof)).json()).toEqual({
      passwordSetupRequired: true,
      securitySetupRequired: true,
    });
    expect((await request('security-questions', proof, { answers })).statusCode).toBe(401);
    expect(
      (await request('password', proof, { password: freshPassword, repeatPassword: freshPassword })).statusCode,
    ).toBe(200);
    expect((await request('status', proof)).json()).toEqual({
      passwordSetupRequired: false,
      securitySetupRequired: true,
    });
    await expect(auth.login(created.username, freshPassword, 'origin', 'normal')).rejects.toBeDefined();
    const completed = await request('security-questions', proof, { answers });
    expect(completed.statusCode).toBe(200);
    expect(String(completed.headers['set-cookie'])).toContain('Max-Age=0');
    expect((await request('status', proof)).statusCode).toBe(401);
    const normal = await auth.login(created.username, freshPassword, 'origin', 'normal');
    await expect(auth.authenticate(`Bearer ${normal.accessToken}`)).resolves.toMatchObject({ userId: created.id });
    const actions = await db.pool.query<{ action: string }>(
      'SELECT action FROM core.audit_events WHERE target_id = $1 ORDER BY id',
      [created.id],
    );
    for (const action of [
      'account_created_by_admin',
      'setup_credential_issued',
      'setup_credential_consumed',
      'setup_password_completed',
      'setup_completed',
    ])
      expect(actions.rows.map((row) => row.action)).toContain(action);
    expect(capture.raw.join('')).not.toContain(created.setupCredential);
    expect(capture.raw.join('')).not.toContain('private setup answer');
  });
  it('accepts an administrator-supplied temporary password without echoing it', async () => {
    const created = await create(password);
    expect(created).not.toHaveProperty('setupCredential');
    const proof = await auth.setup.begin(created.username, password, 'origin', 'begin');
    await expect(auth.setup.password(proof.token, password, password, 'origin', 'same')).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      auth.setup.password(proof.token, freshPassword, 'different', 'origin', 'mismatch'),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      auth.setup.password(proof.token, freshPassword, freshPassword, 'origin', 'new'),
    ).resolves.toBeUndefined();
  });
  it('rejects credential replay, concurrent starts and arbitrary setup proofs', async () => {
    const created = await create();
    const credential = created.setupCredential!;
    const results = await Promise.allSettled([
      auth.setup.begin(created.username, credential, 'origin', 'one'),
      auth.setup.begin(created.username, credential, 'origin', 'two'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    await expect(auth.setup.begin(created.username, credential, 'origin', 'replay')).rejects.toBeDefined();
    await expect(auth.setup.status('A'.repeat(43))).rejects.toBeDefined();
    await expect(auth.setup.status(undefined)).rejects.toBeDefined();
  });
  it('persists progress across restart without extending flow expiry and serializes password completion', async () => {
    const created = await create();
    const proof = await auth.setup.begin(created.username, created.setupCredential!, 'origin', 'begin');
    const restarted = await createAuthService(db, config);
    expect(await restarted.setup.status(proof.token)).toEqual({
      passwordSetupRequired: true,
      securitySetupRequired: true,
    });
    const results = await Promise.allSettled([
      restarted.setup.password(proof.token, freshPassword, freshPassword, 'origin', 'one'),
      restarted.setup.password(proof.token, freshPassword, freshPassword, 'origin', 'two'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    await adminDb.query(
      "UPDATE core.account_setup_flows SET expires_at = clock_timestamp() - interval '1 second', created_at = clock_timestamp() - interval '20 minutes' WHERE user_id = $1",
      [created.id],
    );
    await expect(restarted.setup.status(proof.token)).rejects.toBeDefined();
    await expect(restarted.setup.security(proof.token, answers, 'origin', 'late')).rejects.toBeDefined();
  });
  it('rejects expired unused credentials and fake/ordinary-account setup attempts generically', async () => {
    const created = await create();
    await adminDb.query(
      "UPDATE core.users SET setup_credential_expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
      [created.id],
    );
    for (const [username, credential] of [
      [created.username, created.setupCredential!],
      ['missing_user', password],
      ['operator', password],
      ['not a username', password],
    ])
      await expect(auth.setup.begin(username!, credential!, 'origin', 'invalid')).rejects.toMatchObject({
        statusCode: 401,
      });
  });
  it.each(['locked', 'banned', 'deactivated'])('blocks %s users between setup steps', async (state) => {
    const created = await create();
    const proof = await auth.setup.begin(created.username, created.setupCredential!, 'origin', 'begin');
    await adminDb.query(
      "UPDATE core.users SET account_status = $2, state_reason = 'test', locked_until = CASE WHEN $2 = 'locked' THEN clock_timestamp() + interval '1 hour' ELSE NULL END WHERE id = $1",
      [created.id, state],
    );
    await expect(
      auth.setup.password(proof.token, freshPassword, freshPassword, 'origin', 'denied'),
    ).rejects.toBeDefined();
  });
  it('rejects missing CSRF, forged body ownership and non-admin callers', async () => {
    for (const path of ['start', 'password', 'security-questions'])
      expect((await app.inject({ method: 'POST', url: `/api/v1/auth/setup/${path}`, payload: {} })).statusCode).toBe(
        403,
      );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/users',
          headers: { authorization: `Bearer ${actorToken}` },
          payload: { username: 'bad_body', currentPassword: password, roles: ['admin'] },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/users',
          payload: { username: 'bad_body', currentPassword: password },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('rejects duplicate questions without partial setup and admits one concurrent completion', async () => {
    const created = await create();
    const proof = await auth.setup.begin(created.username, created.setupCredential!, 'origin', 'begin');
    await auth.setup.password(proof.token, freshPassword, freshPassword, 'origin', 'password');
    await expect(
      auth.setup.security(proof.token, [answers[0]!, ...answers.slice(0, 4)], 'origin', 'duplicate'),
    ).rejects.toMatchObject({ statusCode: 400 });
    const results = await Promise.allSettled([
      auth.setup.security(proof.token, answers, 'origin', 'one'),
      auth.setup.security(proof.token, answers, 'origin', 'two'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      (await db.query('SELECT question_id FROM core.user_security_answers WHERE user_id = $1', [created.id])).rows,
    ).toHaveLength(5);
  });
});

it('rolls back final setup flags, answer hashes and proof consumption when auditing fails', async () => {
  const created = await create();
  const proof = await auth.setup.begin(created.username, created.setupCredential!, 'origin', 'begin');
  await auth.setup.password(proof.token, freshPassword, freshPassword, 'origin', 'password');
  await adminDb.query(
    "CREATE FUNCTION core.reject_setup_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'disposable audit failure'; END $$",
  );
  await adminDb.query(
    "CREATE TRIGGER reject_setup_audit BEFORE INSERT ON core.audit_events FOR EACH ROW WHEN (NEW.request_id = 'forced-setup-failure') EXECUTE FUNCTION core.reject_setup_audit()",
  );
  try {
    await expect(auth.setup.security(proof.token, answers, 'origin', 'forced-setup-failure')).rejects.toBeDefined();
    expect(await auth.setup.status(proof.token)).toEqual({ passwordSetupRequired: false, securitySetupRequired: true });
    expect(
      (await db.query('SELECT question_id FROM core.user_security_answers WHERE user_id = $1', [created.id])).rows,
    ).toHaveLength(0);
  } finally {
    await adminDb.query('DROP TRIGGER reject_setup_audit ON core.audit_events');
    await adminDb.query('DROP FUNCTION core.reject_setup_audit()');
  }
  await expect(auth.setup.security(proof.token, answers, 'origin', 'retry')).resolves.toBeUndefined();
});
it('persists setup-credential guessing limits across a service restart', async () => {
  const created = await create();
  const limited = await createAuthService(db, { ...config, maxAccountAttempts: 1 });
  await expect(limited.setup.begin(created.username, 'wrong', 'limited-origin', 'one')).rejects.toMatchObject({
    statusCode: 401,
  });
  const restarted = await createAuthService(db, { ...config, maxAccountAttempts: 1 });
  await expect(
    restarted.setup.begin(created.username, created.setupCredential!, 'limited-origin', 'two'),
  ).rejects.toMatchObject({ statusCode: 429 });
});

function reissue(id: string, currentPassword = password, reason = 'lost setup proof', requestId = 'reissue') {
  return auth.administration.reissueSetupCredential(
    { userId: actorId, sessionId: actorSession },
    id,
    reason,
    currentPassword,
    'reissue-origin',
    requestId,
  );
}
describe('administrator reissuance of pending initial setup only', () => {
  it('replaces an expired credential, preserves account identity and completes ordered setup with fresh material', async () => {
    const created = await create();
    await adminDb.query(
      "UPDATE core.users SET setup_credential_expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
      [created.id],
    );
    const result = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/users/${created.id}/setup-credential`,
      headers: { authorization: `Bearer ${actorToken}`, origin: config.origin },
      payload: { currentPassword: password, reason: 'expired first credential' },
    });
    expect(result.statusCode).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    const fresh = result.json<{ id: string; username: string; setupCredential: string; expiresAt: string }>();
    expect(fresh.id).toBe(created.id);
    expect(fresh.username).toBe(created.username);
    expect(fresh.setupCredential).toMatch(/^[A-Za-z0-9_-]{43}!9$/);
    expect(fresh.setupCredential).not.toBe(created.setupCredential);
    expect(Date.parse(fresh.expiresAt) - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000);
    await expect(auth.setup.begin(created.username, created.setupCredential!, 'origin', 'old')).rejects.toMatchObject({
      statusCode: 401,
    });
    const proof = await auth.setup.begin(fresh.username, fresh.setupCredential, 'origin', 'fresh');
    await auth.setup.password(proof.token, freshPassword, freshPassword, 'origin', 'password');
    await auth.setup.security(proof.token, answers, 'origin', 'security');
    await expect(auth.login(fresh.username, freshPassword, 'origin', 'login')).resolves.toHaveProperty('accessToken');
    const event = (
      await db.pool.query<{ details: Record<string, unknown> }>(
        "SELECT details FROM core.audit_events WHERE target_id = $1 AND action = 'setup_credential_reissued'",
        [created.id],
      )
    ).rows[0]!;
    expect(event.details).toMatchObject({
      reason: 'expired first credential',
      source: 'administrator',
      next: { passwordSetupRequired: true, securitySetupRequired: true },
    });
    const stored = JSON.stringify(event);
    expect(stored).not.toContain(fresh.setupCredential);
    expect(capture.raw.join('')).not.toContain(fresh.setupCredential);
    expect(
      (
        await app.inject({
          url: `/api/v1/admin/users/${created.id}`,
          headers: { authorization: `Bearer ${actorToken}` },
        })
      ).body,
    ).not.toContain('setupCredential');
  });
  it.each([false, true])(
    'invalidates consumed proofs and restarts both steps after password-stage completion=%s',
    async (passwordDone) => {
      const created = await create();
      const proof = await auth.setup.begin(created.username, created.setupCredential!, 'origin', 'begin');
      if (passwordDone) await auth.setup.password(proof.token, freshPassword, freshPassword, 'origin', 'password');
      const fresh = await reissue(created.id);
      await expect(auth.setup.status(proof.token)).rejects.toMatchObject({ statusCode: 401 });
      await expect(
        auth.setup.password(proof.token, freshPassword, freshPassword, 'origin', 'old'),
      ).rejects.toMatchObject({ statusCode: 401 });
      const next = await auth.setup.begin(created.username, fresh.setupCredential, 'origin', 'fresh');
      expect(await auth.setup.status(next.token)).toEqual({ passwordSetupRequired: true, securitySetupRequired: true });
      await expect(auth.setup.security(next.token, answers, 'origin', 'wrong-order')).rejects.toMatchObject({
        statusCode: 401,
      });
    },
  );
  it.each(['locked', 'banned', 'deactivated', 'completed', 'ordinary'] as const)(
    'never reactivates or resets a %s account',
    async (mode) => {
      const created = await create();
      if (mode === 'completed')
        await adminDb.query(
          'UPDATE core.users SET password_setup_required = false,security_setup_required = false WHERE id = $1',
          [created.id],
        );
      else if (mode === 'ordinary')
        await adminDb.query('UPDATE core.users SET setup_credential_expires_at = NULL WHERE id = $1', [created.id]);
      else
        await adminDb.query(
          "UPDATE core.users SET account_status = $2,state_reason = 'fixture reason',locked_until = CASE WHEN $2 = 'locked' THEN clock_timestamp() + interval '10 minutes' ELSE NULL END WHERE id = $1",
          [created.id, mode],
        );
      const before = (
        await db.pool.query<Record<string, unknown>>('SELECT * FROM core.users WHERE id = $1', [created.id])
      ).rows[0];
      await expect(reissue(created.id)).rejects.toMatchObject({ statusCode: 409 });
      expect(
        (await db.pool.query<Record<string, unknown>>('SELECT * FROM core.users WHERE id = $1', [created.id])).rows[0],
      ).toEqual(before);
    },
  );
  it('requires current permission, password, strict input and same-origin requests', async () => {
    const created = await create(),
      path = `/api/v1/admin/users/${created.id}/setup-credential`;
    const send = (body: Record<string, unknown>, origin = config.origin) =>
      app.inject({
        method: 'POST',
        url: path,
        headers: { authorization: `Bearer ${actorToken}`, origin },
        payload: body,
      });
    for (const body of [
      { currentPassword: password, reason: '' },
      { currentPassword: password, reason: 'reason', extra: true },
    ])
      expect((await send(body)).statusCode).toBe(400);
    expect((await send({ currentPassword: password, reason: 'reason' }, 'https://untrusted.test')).statusCode).toBe(
      403,
    );
    expect((await send({ currentPassword: 'wrong', reason: 'reason' })).statusCode).toBe(401);
    await adminDb.query(
      "DELETE FROM core.user_roles WHERE user_id = $1 AND role_id IN (SELECT id FROM core.roles WHERE key = 'admin')",
      [actorId],
    );
    expect((await send({ currentPassword: password, reason: 'reason' })).statusCode).toBe(403);
    await expect(reissue('01902c60-0000-7000-8000-000000000001')).rejects.toMatchObject({ statusCode: 403 });
  });
  it('rolls back password, expiry and proof invalidation if the audit write fails', async () => {
    const created = await create(),
      proof = await auth.setup.begin(created.username, created.setupCredential!, 'origin', 'begin');
    const before = (
      await db.pool.query<Record<string, unknown>>('SELECT * FROM core.users WHERE id = $1', [created.id])
    ).rows[0];
    await adminDb.query(
      "CREATE FUNCTION core.reject_reissue_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'disposable audit failure'; END $$",
    );
    await adminDb.query(
      "CREATE TRIGGER reject_reissue_audit BEFORE INSERT ON core.audit_events FOR EACH ROW WHEN (NEW.request_id = 'forced-reissue-failure') EXECUTE FUNCTION core.reject_reissue_audit()",
    );
    try {
      await expect(reissue(created.id, password, 'reason', 'forced-reissue-failure')).rejects.toBeDefined();
      expect(
        (await db.pool.query<Record<string, unknown>>('SELECT * FROM core.users WHERE id = $1', [created.id])).rows[0],
      ).toEqual(before);
      await expect(auth.setup.status(proof.token)).resolves.toEqual({
        passwordSetupRequired: true,
        securitySetupRequired: true,
      });
    } finally {
      await adminDb.query('DROP TRIGGER reject_reissue_audit ON core.audit_events');
      await adminDb.query('DROP FUNCTION core.reject_reissue_audit()');
    }
  });
  it('serializes concurrent reissuance so only the last committed credential can begin setup', async () => {
    const created = await create();
    const credentials = await Promise.all([
      reissue(created.id, password, 'first'),
      reissue(created.id, password, 'second'),
    ]);
    const attempts = await Promise.allSettled(
      credentials.map((value) => auth.setup.begin(created.username, value.setupCredential, 'origin', 'begin')),
    );
    expect(attempts.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
    expect(
      (
        await db.pool.query(
          "SELECT id FROM core.audit_events WHERE target_id = $1 AND action = 'setup_credential_reissued'",
          [created.id],
        )
      ).rowCount,
    ).toBe(2);
  });
  it('revokes all pending session/recovery grants without erasing their records', async () => {
    const created = await create();
    await adminDb.query(
      "INSERT INTO core.session_families(user_id,expires_at) VALUES ($1,clock_timestamp() + interval '1 day')",
      [created.id],
    );
    await adminDb.query(
      "INSERT INTO core.password_reset_challenges(token_hash,user_id,account_key_hash,question_ids,phase,expires_at,grant_hash,grant_expires_at) VALUES ($1,$2,$3,ARRAY[1,2,3],'verified',clock_timestamp() + interval '1 hour',$4,clock_timestamp() + interval '10 minutes')",
      ['a'.repeat(64), created.id, 'b'.repeat(64), 'c'.repeat(64)],
    );
    await reissue(created.id);
    const revoked = (
      await db.pool.query<{ revoked_at: Date | null; revocation_reason: string | null }>(
        'SELECT revoked_at,revocation_reason FROM core.session_families WHERE user_id = $1',
        [created.id],
      )
    ).rows[0]!;
    expect(revoked.revoked_at).toBeInstanceOf(Date);
    expect(revoked.revocation_reason).toBe('setup_credential_reissued');
    expect(
      (
        await db.pool.query(
          'SELECT phase,grant_hash,grant_expires_at FROM core.password_reset_challenges WHERE user_id = $1',
          [created.id],
        )
      ).rows[0],
    ).toEqual({ phase: 'consumed', grant_hash: null, grant_expires_at: null });
  });
});

it('preserves persisted administrator reissuance quotas across a service restart', async () => {
  const created = await create();
  const limitedConfig = { ...config, maxAccountAttempts: 1 };
  const limited = await createAuthService(db, limitedConfig);
  const actor = { userId: actorId, sessionId: actorSession };
  await limited.administration.reissueSetupCredential(
    actor,
    created.id,
    'first',
    'Sailing!violet782',
    'first-origin',
    'first',
  );
  const restarted = await createAuthService(db, limitedConfig);
  await expect(
    restarted.administration.reissueSetupCredential(
      actor,
      created.id,
      'second',
      'Sailing!violet782',
      'different-origin',
      'second',
    ),
  ).rejects.toMatchObject({ statusCode: 429 });
});
it('clears only pending-account setup budgets and preserves origin abuse limits on reissuance', async () => {
  const created = await create();
  const keys = [
    ['setup-start-account', created.username],
    ['setup-step-account', created.id],
    ['setup-start-origin', 'abuse-origin'],
  ].map(([scope, value]) => createHmac('sha256', config.secret).update(`${scope}:${value}`).digest('hex'));
  for (const key of keys)
    await adminDb.query('INSERT INTO core.auth_buckets(key_hash,attempted_at) VALUES ($1,ARRAY[clock_timestamp()])', [
      key,
    ]);
  await reissue(created.id);
  for (let i = 0; i < keys.length; i++)
    expect(
      (
        await db.pool.query<{ size: number }>(
          'SELECT cardinality(attempted_at) AS size FROM core.auth_buckets WHERE key_hash = $1',
          [keys[i]],
        )
      ).rows[0]!.size,
    ).toBe(i === 2 ? 1 : 0);
});

it('never resets a completed account when setup completion races with reissuance', async () => {
  const created = await create(),
    proof = await auth.setup.begin(created.username, created.setupCredential!, 'origin', 'begin');
  await auth.setup.password(proof.token, freshPassword, freshPassword, 'origin', 'password');
  const results = await Promise.allSettled([
    auth.setup.security(proof.token, answers, 'origin', 'complete'),
    reissue(created.id),
  ]);
  expect(results.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
  const row = (
    await db.pool.query<{ password_setup_required: boolean; security_setup_required: boolean }>(
      'SELECT password_setup_required,security_setup_required FROM core.users WHERE id = $1',
      [created.id],
    )
  ).rows[0]!;
  if (results[0].status === 'fulfilled') {
    expect(row).toEqual({ password_setup_required: false, security_setup_required: false });
    expect(results[1]).toMatchObject({ status: 'rejected', reason: { statusCode: 409 } });
  } else {
    expect(row).toEqual({ password_setup_required: true, security_setup_required: true });
    await expect(auth.setup.status(proof.token)).rejects.toMatchObject({ statusCode: 401 });
  }
});
