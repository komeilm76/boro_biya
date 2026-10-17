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
    expect((await app.inject(`/api/v1/admin/users/${created.id}`)).statusCode).toBe(404);
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
