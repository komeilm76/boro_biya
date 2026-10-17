import { createHmac } from 'node:crypto';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, initCluster, type Db } from '@boro-biya/db';
import { createDatabaseFor, injectedPgAdminUrl, type TestDatabaseHandle } from '@boro-biya/test-utils/pg';
import { makeCapturedLog, makeServerConfigFixture } from '@boro-biya/test-utils';
import { createLogger, createMetricsRegistry } from '@boro-biya/server-runtime';
import { createAuthService, type AuthService } from '../../src/auth/service.js';
import { readAuthConfig } from '../../src/auth/config.js';
import { buildApp } from '../../src/app.js';

const config = readAuthConfig({
  SESSION_SECRET: 'disposable-recovery-test-signing-material',
  WEB_ORIGIN: 'https://example.test',
  NODE_ENV: 'test',
  RECOVERY_MAX_ATTEMPTS: '3',
});
const password = 'Sailing!violet782';
const newPassword = 'Another!violet42';
let database: TestDatabaseHandle;
let db: Db;
let admin: Db;
let app: FastifyInstance;
let auth: AuthService;
let userId = '';
let passwordHash = '';
let csrf = '';
let answers: Array<{ question_id: number; answer_hash: string }> = [];
const jar = new Map<string, string>();
const capture = makeCapturedLog();
beforeAll(async () => {
  database = await createDatabaseFor(injectedPgAdminUrl(), 'recovery');
  await initCluster({
    adminConnectionString: database.adminConnectionString,
    passwords: { core: 'recovery-test-only', relation: 'recovery-test-only', sos: 'recovery-test-only' },
    repoRoot: resolve('.'),
  });
  admin = createDb({ connectionString: database.adminConnectionString });
  const url = new URL(database.adminConnectionString);
  url.username = 'boro_core';
  url.password = 'recovery-test-only';
  db = createDb({ connectionString: url.toString() });
  auth = await createAuthService(db, config);
  userId = (
    await auth.register(
      {
        username: 'Alice',
        password,
        repeatPassword: password,
        answers: [1, 2, 3, 4, 5].map((questionId) => ({ questionId, answer: `invented answer ${questionId}` })),
      },
      'setup',
      'setup',
    )
  ).id;
  passwordHash = (
    await db.pool.query<{ password_hash: string }>('SELECT password_hash FROM core.users WHERE id = $1', [userId])
  ).rows[0]!.password_hash;
  answers = (
    await db.pool.query<{ question_id: number; answer_hash: string }>(
      'SELECT question_id, answer_hash FROM core.user_security_answers WHERE user_id = $1 ORDER BY question_id',
      [userId],
    )
  ).rows;
  app = buildApp({
    config: makeServerConfigFixture(),
    auth,
    registry: createMetricsRegistry(),
    logger: createLogger({ service: 'api', version: 'test', commit: 'test', level: 'debug', sink: capture.sink }),
  });
  csrf = (await app.inject('/api/v1/auth/csrf')).json<{ csrfToken: string }>().csrfToken;
});
beforeEach(async () => {
  jar.clear();
  jar.set('boro_csrf', csrf);
  await admin.query(
    'TRUNCATE core.password_reset_challenges, core.notifications, core.auth_buckets, core.audit_events',
  );
  await admin.query(
    "UPDATE core.users SET password_hash = $2, account_status = 'active', locked_until = NULL, state_reason = NULL, password_setup_required = false, security_setup_required = false WHERE id = $1",
    [userId, passwordHash],
  );
  await admin.query('DELETE FROM core.user_security_answers WHERE user_id = $1', [userId]);
  for (const answer of answers)
    await admin.query(
      'INSERT INTO core.user_security_answers(user_id, question_id, answer_hash, normalization_version) VALUES ($1, $2, $3, 1)',
      [userId, answer.question_id, answer.answer_hash],
    );
  await admin.query(
    "UPDATE core.session_families SET revoked_at = clock_timestamp(), revocation_reason = 'test_reset' WHERE revoked_at IS NULL",
  );
});
afterAll(async () => {
  await app?.close();
  await db?.close();
  await admin?.close();
  await database?.drop();
});
async function request(path: string, payload?: unknown) {
  const response = await app.inject({
    url: `/api/v1/auth/password/${path}`,
    method: 'POST',
    headers: { origin: config.origin, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), 'x-csrf-token': csrf },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
  const header = response.headers['set-cookie'];
  for (const cookie of typeof header === 'string' ? [header] : (header ?? [])) {
    const pair = cookie.split(';')[0] ?? '';
    const at = pair.indexOf('=');
    const name = pair.slice(0, at);
    const value = pair.slice(at + 1);
    if (value) jar.set(name, value);
    else jar.delete(name);
  }
  return response;
}
async function start(username = 'alice') {
  expect((await request('forgot', { username })).statusCode).toBe(200);
  const questions = await request('recover/questions');
  expect(questions.statusCode).toBe(200);
  return questions.json<Array<{ id: number; textKey: string }>>();
}
async function verified() {
  const questions = await start();
  const response = await request('recover/verify', {
    answers: questions.map((q) => ({ questionId: q.id, answer: ` invented  answer ${q.id} ` })),
  });
  expect(response.statusCode).toBe(200);
  return questions;
}
describe('persisted recovery workflow (AUTH-13 … AUTH-20, AUTH-40)', () => {
  it('creates indistinguishable generic real/fake flows with three unique questions and hashed cookie proofs', async () => {
    const real = await start();
    expect(new Set(real.map((q) => q.id)).size).toBe(3);
    expect(real.every((q) => q.id <= 5)).toBe(true);
    const raw = jar.get('__Host-boro_recovery')!;
    const fake = await start('missing');
    expect(fake).toHaveLength(3);
    expect(new Set(fake.map((q) => q.id)).size).toBe(3);
    const response = await request('recover/verify', {
      answers: fake.map((q) => ({ questionId: q.id, answer: `invented answer ${q.id}` })),
    });
    expect(response.statusCode).toBe(401);
    const rows = await db.query('SELECT * FROM core.password_reset_challenges');
    expect(JSON.stringify(rows.rows)).not.toContain(raw);
    expect(JSON.stringify(rows.rows)).not.toContain('invented answer');
    expect(rows.rows.some((row) => row['user_id'] === null)).toBe(true);
  });
  it('resets atomically, invalidates all families/grants, unlocks and persists the in-app notice', async () => {
    const first = await auth.login('alice', password, '127.0.0.1', 'first');
    const second = await auth.login('alice', password, '127.0.0.1', 'second');
    await verified();
    await admin.query(
      "UPDATE core.users SET account_status = 'locked', locked_until = clock_timestamp() + interval '900 seconds', state_changed_at = clock_timestamp(), state_reason = 'test' WHERE id = $1",
      [userId],
    );
    const key = createHmac('sha256', config.secret).update('login-account:alice').digest('hex');
    await admin.query(
      'INSERT INTO core.auth_buckets(key_hash, attempted_at) VALUES ($1, ARRAY(SELECT clock_timestamp() FROM generate_series(1, 10))) ON CONFLICT (key_hash) DO UPDATE SET attempted_at = EXCLUDED.attempted_at',
      [key],
    );
    const raw = jar.get('__Host-boro_recovery')!;
    const grant = jar.get('__Host-boro_reset')!;
    const response = await request('recover/reset', { password: newPassword, repeatPassword: newPassword });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(grant);
    expect(String(response.headers['set-cookie'])).toContain('Max-Age=0');
    expect(await auth.sessions.isActive(userId, first.sessionId)).toBe(false);
    expect(await auth.sessions.rotate(second.refreshToken)).toBeNull();
    const fresh = await auth.login('alice', newPassword, '127.0.0.1', 'fresh');
    const profile = await app.inject({
      url: '/api/v1/users/me',
      headers: { authorization: `Bearer ${fresh.accessToken}` },
    });
    expect(profile.json<{ securityNotices: Array<{ event: string }> }>().securityNotices[0]?.event).toBe(
      'password_reset',
    );
    jar.set('__Host-boro_recovery', raw);
    jar.set('__Host-boro_reset', grant);
    expect((await request('recover/reset', { password: newPassword, repeatPassword: newPassword })).statusCode).toBe(
      401,
    );
    expect((await db.query("SELECT id FROM core.audit_events WHERE action = 'password_reset'")).rows).toHaveLength(1);
    expect(capture.raw.join('')).not.toContain(raw);
    expect(capture.raw.join('')).not.toContain(grant);
    expect(capture.raw.join('')).not.toContain(newPassword);
  });
  it('preserves selected questions and consumed state across a service restart', async () => {
    const selected = await start();
    const raw = jar.get('__Host-boro_recovery');
    const restarted = await createAuthService(db, config);
    expect(await restarted.recovery.questions(raw, '127.0.0.1', 'restart')).toEqual(selected);
    const result = await restarted.recovery.verify(
      raw,
      selected.map((q) => ({ questionId: q.id, answer: `invented answer ${q.id}` })),
      '127.0.0.1',
      'verify',
    );
    await expect(
      restarted.recovery.verify(
        raw,
        selected.map((q) => ({ questionId: q.id, answer: 'wrong' })),
        '127.0.0.1',
        'replay',
      ),
    ).rejects.toMatchObject({ statusCode: 401 });
    await restarted.recovery.reset(raw, result.token, newPassword, newPassword, '127.0.0.1', 'reset');
  });
  it('counts guesses persistently and shares the account budget across newly issued challenges', async () => {
    const selected = await start();
    for (let i = 0; i < 3; i++)
      expect(
        (await request('recover/verify', { answers: selected.map((q) => ({ questionId: q.id, answer: 'wrong' })) }))
          .statusCode,
      ).toBe(401);
    expect((await db.query('SELECT phase, attempts FROM core.password_reset_challenges')).rows).toEqual([
      { phase: 'consumed', attempts: 3 },
    ]);
    const next = await start();
    expect(
      (
        await request('recover/verify', {
          answers: next.map((q) => ({ questionId: q.id, answer: `invented answer ${q.id}` })),
        })
      ).statusCode,
    ).toBe(429);
  });
  it('rejects duplicate/substituted questions without per-answer feedback', async () => {
    const selected = await start();
    const response = await request('recover/verify', {
      answers: Array.from({ length: 3 }, () => ({
        questionId: selected[0]!.id,
        answer: `invented answer ${selected[0]!.id}`,
      })),
    });
    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain('correct');
  });
  it('expires challenges and reset grants using database time', async () => {
    await start();
    await admin.query(
      "UPDATE core.password_reset_challenges SET created_at = clock_timestamp() - interval '301 seconds', expires_at = clock_timestamp() - interval '1 second'",
    );
    expect((await request('recover/questions')).statusCode).toBe(401);
    await verified();
    await admin.query(
      "UPDATE core.password_reset_challenges SET grant_expires_at = clock_timestamp() - interval '1 second' WHERE phase = 'verified'",
    );
    expect((await request('recover/reset', { password: newPassword, repeatPassword: newPassword })).statusCode).toBe(
      401,
    );
  });
  it('binds the grant to its issuing flow and permits policy correction without consuming a valid grant', async () => {
    await verified();
    const flow = jar.get('__Host-boro_recovery')!;
    const grant = jar.get('__Host-boro_reset')!;
    await start('missing');
    jar.set('__Host-boro_reset', grant);
    expect((await request('recover/reset', { password: newPassword, repeatPassword: newPassword })).statusCode).toBe(
      401,
    );
    jar.set('__Host-boro_recovery', flow);
    expect((await request('recover/reset', { password: 'short', repeatPassword: 'short' })).statusCode).toBe(400);
    expect((await request('recover/reset', { password: newPassword, repeatPassword: newPassword })).statusCode).toBe(
      200,
    );
  });
  it('admits exactly one concurrent verification and exactly one concurrent reset', async () => {
    const selected = await start();
    const payload = { answers: selected.map((q) => ({ questionId: q.id, answer: `invented answer ${q.id}` })) };
    const verifiedResponses = await Promise.all([
      request('recover/verify', payload),
      request('recover/verify', payload),
    ]);
    expect(verifiedResponses.map((r) => r.statusCode).sort()).toEqual([200, 401]);
    const results = await Promise.all([
      request('recover/reset', { password: newPassword, repeatPassword: newPassword }),
      request('recover/reset', { password: newPassword, repeatPassword: newPassword }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 401]);
    expect((await db.query('SELECT id FROM core.notifications')).rows).toHaveLength(1);
  });
  it.each(['banned', 'deactivated', 'password', 'security'])(
    'cannot bypass the %s state after verification',
    async (state) => {
      await verified();
      await admin.query(
        "UPDATE core.users SET account_status = $2, locked_until = CASE WHEN $2 = 'locked' THEN clock_timestamp() + interval '1 hour' ELSE NULL END, state_reason = 'test', password_setup_required = $3, security_setup_required = $4 WHERE id = $1",
        [
          userId,
          ['password', 'security'].includes(state) ? 'active' : state,
          state === 'password',
          state === 'security',
        ],
      );
      expect((await request('recover/reset', { password: newPassword, repeatPassword: newPassword })).statusCode).toBe(
        401,
      );
    },
  );
  it('invalidates recovery when the password or registered answers change', async () => {
    await verified();
    const login = await auth.login('alice', password, '127.0.0.1', 'login');
    await auth.changePassword(userId, login.sessionId, password, newPassword, newPassword, 'change');
    expect((await request('recover/reset', { password: newPassword, repeatPassword: newPassword })).statusCode).toBe(
      401,
    );
  });
  it('fails every disabled-stage call before creating any flow or budget state', async () => {
    const disabled = await createAuthService(db, { ...config, recoveryEnabled: false });
    for (const promise of [
      disabled.recovery.forgot('alice', 'origin', 'req'),
      disabled.recovery.questions(undefined, 'origin', 'req'),
      disabled.recovery.verify(undefined, [], 'origin', 'req'),
      disabled.recovery.reset(undefined, undefined, newPassword, newPassword, 'origin', 'req'),
    ])
      await expect(promise).rejects.toMatchObject({ statusCode: 503 });
    expect((await db.query('SELECT token_hash FROM core.password_reset_challenges')).rows).toHaveLength(0);
    expect((await db.query('SELECT key_hash FROM core.auth_buckets')).rows).toHaveLength(0);
  });
});

describe('authenticated security-answer replacement', () => {
  const replacement = [4, 5, 6, 7, 8].map((questionId) => ({ questionId, answer: `replacement answer ${questionId}` }));
  it('replaces five hashes, consumes verified recovery, revokes every session and persists an audit/notice', async () => {
    await verified();
    const login = await auth.login('alice', password, 'origin', 'login');
    const other = await auth.login('alice', password, 'origin', 'login');
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/security-questions/change',
      headers: { authorization: `Bearer ${login.accessToken}` },
      payload: { currentPassword: password, answers: replacement },
    });
    expect(response.statusCode).toBe(200);
    const rows = await db.pool.query<{ question_id: number; answer_hash: string; normalization_version: number }>(
      'SELECT question_id, answer_hash, normalization_version FROM core.user_security_answers WHERE user_id = $1 ORDER BY question_id',
      [userId],
    );
    expect(rows.rows.map((row) => row.question_id)).toEqual([4, 5, 6, 7, 8]);
    for (const row of rows.rows) {
      expect(row.answer_hash).toMatch(/^\$argon2id\$/);
      expect(row.normalization_version).toBe(1);
    }
    await expect(auth.authenticate(`Bearer ${login.accessToken}`)).rejects.toBeDefined();
    await expect(auth.refresh(other.refreshToken, 'origin', 'refresh')).rejects.toBeDefined();
    expect((await request('recover/reset', { password: newPassword, repeatPassword: newPassword })).statusCode).toBe(
      401,
    );
    const notices = await auth.securityNotices(userId);
    expect(notices).toHaveLength(1);
    expect(notices[0]?.event).toBe('security_answers_changed');
    expect(notices[0]?.createdAt).toEqual(expect.any(String));
    expect(
      (await db.query("SELECT action FROM core.audit_events WHERE action = 'security_answers_changed'")).rows,
    ).toHaveLength(1);
    const selected = await start();
    expect(selected.every((question) => [4, 5, 6, 7, 8].includes(question.id))).toBe(true);
    expect(
      (
        await request('recover/verify', {
          answers: selected.map((question) => ({
            questionId: question.id,
            answer: `replacement answer ${question.id}`,
          })),
        })
      ).statusCode,
    ).toBe(200);
    expect(capture.raw.join('')).not.toContain('replacement answer');
  });
  it('rejects wrong current credentials and duplicate selections without changing any hashes', async () => {
    const login = await auth.login('alice', password, 'origin', 'login');
    await expect(
      auth.changeSecurityAnswers(userId, login.sessionId, 'wrong', replacement, 'origin', 'change'),
    ).rejects.toBeDefined();
    await expect(
      auth.changeSecurityAnswers(
        userId,
        login.sessionId,
        password,
        [replacement[0]!, ...replacement.slice(0, 4)],
        'origin',
        'change',
      ),
    ).rejects.toBeDefined();
    expect(
      (
        await db.query(
          'SELECT question_id, answer_hash FROM core.user_security_answers WHERE user_id = $1 ORDER BY question_id',
          [userId],
        )
      ).rows,
    ).toEqual(answers);
    expect((await db.query('SELECT id FROM core.notifications')).rows).toHaveLength(0);
  });
  it.each(['locked', 'banned', 'deactivated', 'password', 'security'])(
    'denies replacement for %s accounts',
    async (state) => {
      const login = await auth.login('alice', password, 'origin', 'login');
      await admin.query(
        "UPDATE core.users SET account_status = $2, locked_until = CASE WHEN $2 = 'locked' THEN clock_timestamp() + interval '1 hour' ELSE NULL END, state_reason = 'test', password_setup_required = $3, security_setup_required = $4 WHERE id = $1",
        [
          userId,
          ['password', 'security'].includes(state) ? 'active' : state,
          state === 'password',
          state === 'security',
        ],
      );
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/auth/security-questions/change',
            headers: { authorization: `Bearer ${login.accessToken}` },
            payload: { currentPassword: password, answers: replacement },
          })
        ).statusCode,
      ).toBe(401);
    },
  );
  it('admits only one simultaneous replacement against the same session', async () => {
    const login = await auth.login('alice', password, 'origin', 'login');
    const changes = await Promise.allSettled([
      auth.changeSecurityAnswers(userId, login.sessionId, password, replacement, 'origin', 'first'),
      auth.changeSecurityAnswers(userId, login.sessionId, password, replacement, 'origin', 'second'),
    ]);
    expect(changes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      (await db.query("SELECT id FROM core.notifications WHERE event_type = 'security_answers_changed'")).rows,
    ).toHaveLength(1);
  });
});

it('rolls back answer changes, recovery consumption and revocation when notice persistence fails', async () => {
  await verified();
  const login = await auth.login('alice', password, 'origin', 'login');
  await admin.query(
    "CREATE FUNCTION core.reject_answer_notice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'disposable notice failure'; END $$",
  );
  await admin.query(
    "CREATE TRIGGER reject_answer_notice BEFORE INSERT ON core.notifications FOR EACH ROW WHEN (NEW.event_type = 'security_answers_changed') EXECUTE FUNCTION core.reject_answer_notice()",
  );
  try {
    await expect(
      auth.changeSecurityAnswers(
        userId,
        login.sessionId,
        password,
        [1, 2, 3, 4, 5].map((questionId) => ({ questionId, answer: 'changed answer' })),
        'origin',
        'rollback',
      ),
    ).rejects.toBeDefined();
    expect(
      (
        await db.query(
          'SELECT question_id, answer_hash FROM core.user_security_answers WHERE user_id = $1 ORDER BY question_id',
          [userId],
        )
      ).rows,
    ).toEqual(answers);
    await expect(auth.authenticate(`Bearer ${login.accessToken}`)).resolves.toMatchObject({ userId });
    expect(
      (await db.query("SELECT id FROM core.audit_events WHERE action = 'security_answers_changed'")).rows,
    ).toHaveLength(0);
    expect((await db.query('SELECT phase FROM core.password_reset_challenges')).rows).toEqual([{ phase: 'verified' }]);
  } finally {
    await admin.query('DROP TRIGGER reject_answer_notice ON core.notifications');
    await admin.query('DROP FUNCTION core.reject_answer_notice()');
  }
});
