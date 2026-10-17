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
import { validChallengeWork } from '../../src/auth/challenge.js';
const config = readAuthConfig({
  SESSION_SECRET: 'disposable-challenge-session-test-material',
  WEB_ORIGIN: 'https://example.test',
  CAPTCHA_ENABLED: 'true',
  CAPTCHA_TOKEN_SECRET: 'disposable-challenge-only-test-material',
  CAPTCHA_WORK_BITS: '12',
  CAPTCHA_RISK_THRESHOLD: '1',
  LOGIN_MAX_ATTEMPTS_PER_ACCOUNT: '100',
  LOGIN_MAX_ATTEMPTS_PER_ORIGIN: '300',
});
const password = 'Synthetic!orchard782';
let database: TestDatabaseHandle, db: Db, root: Db, auth: AuthService, app: FastifyInstance;
let id = '',
  serial = 0;
const capture = makeCapturedLog();
beforeAll(async () => {
  database = await createDatabaseFor(injectedPgAdminUrl(), 'challenge');
  await initCluster({
    adminConnectionString: database.adminConnectionString,
    passwords: { core: 'challenge-only', relation: 'challenge-only', sos: 'challenge-only' },
    repoRoot: resolve('.'),
  });
  root = createDb({ connectionString: database.adminConnectionString });
  const url = new URL(database.adminConnectionString);
  url.username = 'boro_core';
  url.password = 'challenge-only';
  db = createDb({ connectionString: url.toString() });
  auth = await createAuthService(db, config);
  id = (
    await auth.register(
      {
        username: 'challenge_user',
        password,
        repeatPassword: password,
        answers: [1, 2, 3, 4, 5].map((questionId) => ({ questionId, answer: 'synthetic private answer' })),
      },
      'fixture',
      'fixture',
    )
  ).id;
  await root.query("INSERT INTO core.user_roles(user_id,role_id) SELECT $1,id FROM core.roles WHERE key = 'admin'", [
    id,
  ]);
  app = buildApp({
    config: makeServerConfigFixture(),
    auth,
    registry: createMetricsRegistry(),
    logger: createLogger({ service: 'api', version: 'test', commit: 'test', level: 'debug', sink: capture.sink }),
  });
});
beforeEach(async () => {
  await root.query('TRUNCATE core.auth_buckets,core.captcha_challenges,core.audit_events');
  await root.query(
    "UPDATE core.users SET account_status = 'active',locked_until = NULL,failed_login_count = 0 WHERE id = $1",
    [id],
  );
});
afterAll(async () => {
  await app?.close();
  await db?.close();
  await root?.close();
  await database?.drop();
});
function counter(token: string, bits: number) {
  let result = 0;
  while (!validChallengeWork(token, result, bits)) result++;
  return result;
}
async function issued(purpose: 'login' | 'register' | 'recovery' | 'setup' = 'login', origin = 'origin') {
  await auth.challenge.admit(purpose, origin, 'risk');
  const result = await auth.challenge.issue(purpose, origin, 'issue');
  if (!result.required) throw new Error('expected challenge');
  return result;
}
async function solved(purpose: 'login' | 'register' | 'recovery' | 'setup' = 'login', origin = 'origin') {
  const nonce = await issued(purpose, origin);
  return auth.challenge.verify(nonce.token, counter(nonce.token, nonce.bits), purpose, origin, 'verify');
}
describe('enabled self-hosted adaptive computational challenge', () => {
  it('does not challenge low-risk origins, but enforces admission before native login work after the threshold', async () => {
    expect(await auth.challenge.issue('login', 'origin', 'low')).toEqual({ required: false });
    await expect(auth.login('challenge_user', password, 'origin', 'first')).resolves.toHaveProperty('accessToken');
    await expect(auth.login('challenge_user', password, 'origin', 'missing')).rejects.toMatchObject({
      statusCode: 403,
    });
    const challenge = await auth.challenge.issue('login', 'origin', 'issue');
    if (!challenge.required) throw new Error('expected challenge');
    const proof = await auth.challenge.verify(
      challenge.token,
      counter(challenge.token, challenge.bits),
      'login',
      'origin',
      'verify',
    );
    await expect(auth.login('challenge_user', password, 'origin', 'proved', proof.grant)).resolves.toHaveProperty(
      'accessToken',
    );
    await expect(auth.login('challenge_user', password, 'origin', 'replay', proof.grant)).rejects.toMatchObject({
      statusCode: 403,
    });
    const rows = await db.pool.query<{ token_hash: string; origin_hash: string; grant_hash: string }>(
      'SELECT token_hash,origin_hash,grant_hash FROM core.captcha_challenges',
    );
    expect(JSON.stringify(rows.rows)).not.toContain(challenge.token);
    expect(JSON.stringify(rows.rows)).not.toContain(proof.grant);
    expect(capture.raw.join('')).not.toContain(proof.grant);
  });
  it('increases difficulty within the configured bound without changing existing issued work', async () => {
    const first = await issued();
    await expect(auth.challenge.admit('login', 'origin', 'denied')).rejects.toMatchObject({ statusCode: 403 });
    const harder = await auth.challenge.issue('login', 'origin', 'harder');
    expect(harder).toMatchObject({ required: true, bits: 13 });
    expect(first.bits).toBe(12);
    await expect(
      auth.challenge.verify(first.token, counter(first.token, first.bits), 'login', 'origin', 'old-work'),
    ).resolves.toHaveProperty('grant');
  });
  it('serializes nonce and grant replay so only one concurrent claimant succeeds', async () => {
    const nonce = await issued();
    const answer = counter(nonce.token, nonce.bits);
    const results = await Promise.allSettled([
      auth.challenge.verify(nonce.token, answer, 'login', 'origin', 'one'),
      auth.challenge.verify(nonce.token, answer, 'login', 'origin', 'two'),
    ]);
    expect(results.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
    const grant = results.find((value) => value.status === 'fulfilled');
    if (!grant || grant.status !== 'fulfilled') throw new Error('expected grant');
    const admissions = await Promise.allSettled([
      auth.challenge.admit('login', 'origin', 'one', grant.value.grant),
      auth.challenge.admit('login', 'origin', 'two', grant.value.grant),
    ]);
    expect(admissions.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
  });
  it('commits wrong-work attempts and rejects an exhausted nonce even with correct work after a restart', async () => {
    const nonce = await issued();
    let wrong = 0;
    while (validChallengeWork(nonce.token, wrong, nonce.bits)) wrong++;
    for (let i = 0; i < 5; i++)
      await expect(auth.challenge.verify(nonce.token, wrong, 'login', 'origin', 'wrong')).rejects.toMatchObject({
        statusCode: 403,
      });
    const restarted = await createAuthService(db, config);
    await expect(
      restarted.challenge.verify(nonce.token, counter(nonce.token, nonce.bits), 'login', 'origin', 'exhausted'),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(
      (await db.pool.query<{ attempts: number }>('SELECT attempts FROM core.captcha_challenges')).rows[0]!.attempts,
    ).toBe(5);
  });
  it('binds both nonce and grant to origin and purpose, without consuming a valid proof for the wrong context', async () => {
    const nonce = await issued();
    const answer = counter(nonce.token, nonce.bits);
    await expect(auth.challenge.verify(nonce.token, answer, 'register', 'origin', 'wrong')).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(auth.challenge.verify(nonce.token, answer, 'login', 'other', 'wrong')).rejects.toMatchObject({
      statusCode: 403,
    });
    const proof = await auth.challenge.verify(nonce.token, answer, 'login', 'origin', 'correct');
    await expect(auth.challenge.admit('register', 'origin', 'wrong', proof.grant)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(auth.challenge.admit('login', 'other', 'wrong', proof.grant)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(auth.challenge.admit('login', 'origin', 'correct', proof.grant)).resolves.toBeUndefined();
  });
  it('rejects expired nonce and grant with database time', async () => {
    const nonce = await issued();
    await root.query(
      "UPDATE core.captcha_challenges SET created_at = clock_timestamp() - interval '10 minutes',expires_at = clock_timestamp() - interval '1 second'",
    );
    await expect(
      auth.challenge.verify(nonce.token, counter(nonce.token, nonce.bits), 'login', 'origin', 'expired'),
    ).rejects.toMatchObject({ statusCode: 403 });
    const fresh = await auth.challenge.issue('login', 'origin', 'fresh');
    if (!fresh.required) throw new Error('expected challenge');
    const proof = await auth.challenge.verify(
      fresh.token,
      counter(fresh.token, fresh.bits),
      'login',
      'origin',
      'verify',
    );
    await root.query(
      "UPDATE core.captcha_challenges SET grant_expires_at = clock_timestamp() - interval '1 second' WHERE grant_hash IS NOT NULL",
    );
    await expect(auth.challenge.admit('login', 'origin', 'expired', proof.grant)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
  it.each(['register', 'recovery', 'setup'] as const)(
    'supports enabled %s admission without disabling proof-protected continuation or quotas',
    async (purpose) => {
      const proof = await solved(purpose);
      const username = `captcha_${++serial}`;
      if (purpose === 'register')
        await expect(
          auth.register(
            {
              username,
              password,
              repeatPassword: password,
              answers: [1, 2, 3, 4, 5].map((questionId) => ({ questionId, answer: 'private answer' })),
            },
            'origin',
            'register',
            proof.grant,
          ),
        ).resolves.toHaveProperty('id');
      if (purpose === 'recovery') {
        const flow = await auth.recovery.forgot('challenge_user', 'origin', 'forgot', proof.grant);
        await expect(auth.recovery.questions(flow.token, 'origin', 'questions')).resolves.toHaveLength(3);
      }
      if (purpose === 'setup') {
        const admin = await auth.login('challenge_user', password, 'admin-origin', 'admin');
        const created = await auth.setup.create(id, admin.sessionId, password, { username }, 'admin-origin', 'create');
        const flow = await auth.setup.begin(created.username, created.setupCredential!, 'origin', 'begin', proof.grant);
        await expect(auth.setup.status(flow.token)).resolves.toMatchObject({ passwordSetupRequired: true });
      }
      await expect(auth.challenge.admit(purpose, 'origin', 'replay', proof.grant)).rejects.toMatchObject({
        statusCode: 403,
      });
    },
  );
  it('retains default-off expired records and cleans only expired grace-past rows when explicitly enabled', async () => {
    await issued();
    await root.query(
      "UPDATE core.captcha_challenges SET created_at = clock_timestamp() - interval '20 minutes',expires_at = clock_timestamp() - interval '10 minutes'",
    );
    await auth.challenge.issue('login', 'origin', 'keep');
    expect((await db.pool.query('SELECT token_hash FROM core.captcha_challenges')).rowCount).toBe(2);
    const cleanup = await createAuthService(db, {
      ...config,
      captchaPolicy: { ...config.captchaPolicy!, cleanup: true },
      retentionPolicy: { ...config.retentionPolicy!, automatedDeletionEnabled: true },
    });
    await cleanup.challenge.issue('login', 'origin', 'cleanup');
    expect((await db.pool.query('SELECT token_hash FROM core.captcha_challenges')).rowCount).toBe(2);
  });
  it('rolls grant consumption back if its atomic audit insert fails', async () => {
    const proof = await solved();
    await root.query(
      "CREATE FUNCTION core.reject_captcha_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'disposable failure'; END $$",
    );
    await root.query(
      "CREATE TRIGGER reject_captcha_audit BEFORE INSERT ON core.audit_events FOR EACH ROW WHEN (NEW.request_id = 'captcha-failure') EXECUTE FUNCTION core.reject_captcha_audit()",
    );
    try {
      await expect(auth.challenge.admit('login', 'origin', 'captcha-failure', proof.grant)).rejects.toBeDefined();
    } finally {
      await root.query('DROP TRIGGER reject_captcha_audit ON core.audit_events');
      await root.query('DROP FUNCTION core.reject_captcha_audit()');
    }
    await expect(auth.challenge.admit('login', 'origin', 'retry', proof.grant)).resolves.toBeUndefined();
  });
  it('rate-limits issue and verification across service restart without hashing credentials', async () => {
    const limited = await createAuthService(db, { ...config, maxOriginAttempts: 1 });
    await limited.challenge.issue('login', 'limited', 'first');
    const restarted = await createAuthService(db, { ...config, maxOriginAttempts: 1 });
    await expect(restarted.challenge.issue('login', 'limited', 'second')).rejects.toMatchObject({ statusCode: 429 });
    const nonce = await issued();
    await limited.challenge.verify(nonce.token, counter(nonce.token, nonce.bits), 'login', 'origin', 'first');
    await expect(restarted.challenge.verify(nonce.token, 0, 'login', 'origin', 'second')).rejects.toMatchObject({
      statusCode: 429,
    });
  });
  it('accepts an enabled HTTP login only with a verified Authorization grant once risk requires work', async () => {
    const csrf = (await app.inject('/api/v1/auth/csrf')).json<{ csrfToken: string }>().csrfToken;
    const headers = { origin: config.origin, cookie: `boro_csrf=${csrf}`, 'x-csrf-token': csrf };
    const payload = { username: 'challenge_user', password };
    const login = (proof?: string) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { ...headers, ...(proof ? { authorization: `Bearer ${proof}` } : {}) },
        payload,
      });
    expect((await login()).statusCode).toBe(200);
    expect((await login()).statusCode).toBe(403);
    const issued = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/challenge',
      headers,
      payload: { purpose: 'login' },
    });
    expect(issued.statusCode).toBe(200);
    const nonce = issued.json<{ token: string; bits: number }>();
    const verified = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/challenge/verify',
      headers,
      payload: { purpose: 'login', token: nonce.token, counter: counter(nonce.token, nonce.bits) },
    });
    expect(verified.statusCode).toBe(200);
    const proof = verified.json<{ grant: string }>().grant;
    expect((await login('malformed')).statusCode).toBe(400);
    expect((await login(proof)).statusCode).toBe(200);
    expect((await login(proof)).statusCode).toBe(403);
    expect(capture.raw.join('')).not.toContain(proof);
  });
  it('requires origin/CSRF, strict fields and bounded integers on HTTP challenge endpoints', async () => {
    const csrf = (await app.inject('/api/v1/auth/csrf')).json<{ csrfToken: string }>().csrfToken;
    const headers = { origin: config.origin, cookie: `boro_csrf=${csrf}`, 'x-csrf-token': csrf };
    for (const path of ['challenge', 'challenge/verify'])
      expect((await app.inject({ method: 'POST', url: `/api/v1/auth/${path}`, payload: {} })).statusCode).toBe(403);
    for (const body of [{ purpose: 'invalid' }, { purpose: 'login', extra: true }])
      expect(
        (await app.inject({ method: 'POST', url: '/api/v1/auth/challenge', headers, payload: body })).statusCode,
      ).toBe(400);
    for (const counter of [-1, 0.1, 0x100000000, '1'])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/auth/challenge/verify',
            headers,
            payload: { purpose: 'login', token: 'A'.repeat(43), counter },
          })
        ).statusCode,
      ).toBe(400);
    expect(
      (await app.inject({ method: 'POST', url: '/api/v1/auth/challenge', headers, payload: { purpose: 'login' } }))
        .headers['cache-control'],
    ).toBe('no-store');
  });
});
