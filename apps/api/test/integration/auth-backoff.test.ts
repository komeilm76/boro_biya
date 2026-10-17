import { createHmac } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createDb, initCluster, type Db } from '@boro-biya/db';
import { createDatabaseFor, injectedPgAdminUrl, type TestDatabaseHandle } from '@boro-biya/test-utils/pg';
import { makeCapturedLog, makeServerConfigFixture } from '@boro-biya/test-utils';
import { createLogger, createMetricsRegistry } from '@boro-biya/server-runtime';
import { createAuthService } from '../../src/auth/service.js';
import { readAuthConfig } from '../../src/auth/config.js';
import { createLoginBackoff } from '../../src/auth/backoff.js';
import { identityTransaction } from '../../src/identity/transaction.js';
import { buildApp } from '../../src/app.js';

const config = readAuthConfig({
  SESSION_SECRET: 'disposable-backoff-integration-material',
  WEB_ORIGIN: 'https://example.test',
  NODE_ENV: 'test',
});
const key = (scope: string, value: string) =>
  createHmac('sha256', config.secret).update(`${scope}:${value}`).digest('hex');
const accountKey = key('login-failure-account', 'backoffuser');
const originKey = key('login-failure-origin', '127.0.0.1');
const password = 'Sailing!violet782';
let database: TestDatabaseHandle;
let db: Db;
let admin: Db;
let app: FastifyInstance;
let userId = '';
let csrf = '';
const capture = makeCapturedLog();

beforeAll(async () => {
  database = await createDatabaseFor(injectedPgAdminUrl(), 'backoff');
  await initCluster({
    adminConnectionString: database.adminConnectionString,
    passwords: { core: 'backoff-test-only', relation: 'backoff-test-only', sos: 'backoff-test-only' },
    repoRoot: resolve('.'),
  });
  admin = createDb({ connectionString: database.adminConnectionString });
  const url = new URL(database.adminConnectionString);
  url.username = 'boro_core';
  url.password = 'backoff-test-only';
  db = createDb({ connectionString: url.toString() });
  const auth = await createAuthService(db, config);
  userId = (
    await auth.register(
      {
        username: 'backoffuser',
        password,
        repeatPassword: password,
        answers: [1, 2, 3, 4, 5].map((questionId) => ({ questionId, answer: `invented ${questionId}` })),
      },
      'setup',
      'setup',
    )
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
  await admin.query('TRUNCATE core.auth_buckets, core.audit_events');
  await admin.query(
    "UPDATE core.users SET account_status = 'active', locked_until = NULL, failed_login_count = 0, failed_login_window_started_at = NULL, state_changed_at = clock_timestamp(), state_reason = 'test_reset' WHERE id = $1",
    [userId],
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

async function seed(hash: string, failures: number, ageSeconds = 0) {
  await admin.query(
    `INSERT INTO core.auth_buckets(key_hash, attempted_at)
    VALUES ($1, ARRAY(SELECT clock_timestamp() - $3 * interval '1 second' FROM generate_series(1, $2::integer)))
    ON CONFLICT (key_hash) DO UPDATE SET attempted_at = EXCLUDED.attempted_at`,
    [hash, failures, ageSeconds],
  );
}
function login(username = 'backoffuser', secret = 'wrong', remoteAddress = '127.0.0.1') {
  return app.inject({
    url: '/api/v1/auth/login',
    method: 'POST',
    remoteAddress,
    headers: { origin: config.origin, cookie: `boro_csrf=${csrf}`, 'x-csrf-token': csrf },
    payload: { username, password: secret },
  });
}

describe('persisted progressive login delays and rolling lockouts (AUTH-04, SEC-14 … SEC-19)', () => {
  it('records account and origin failures, but not successful attempts or blocked retries', async () => {
    expect((await login()).statusCode).toBe(401);
    expect((await login()).statusCode).toBe(401);
    const counts = await db.query(
      'SELECT cardinality(attempted_at) AS failures FROM core.auth_buckets WHERE key_hash = ANY($1::text[])',
      [[accountKey, originKey]],
    );
    expect(counts.rows).toEqual([{ failures: 2 }, { failures: 2 }]);
    await seed(accountKey, 7);
    const before = await db.query('SELECT attempted_at FROM core.auth_buckets WHERE key_hash = $1', [accountKey]);
    for (let i = 0; i < 3; i++) {
      const response = await login();
      expect(response.statusCode).toBe(429);
      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
      expect(Number(response.headers['retry-after'])).toBeLessThanOrEqual(30);
    }
    expect(
      (await db.query('SELECT attempted_at FROM core.auth_buckets WHERE key_hash = $1', [accountKey])).rows,
    ).toEqual(before.rows);
    const restarted = await createAuthService(db, config);
    await expect(restarted.login('backoffuser', password, '127.0.0.1', 'restart')).rejects.toMatchObject({
      statusCode: 429,
    });
  });
  it('honours a smaller configured delay cap on the real persisted HTTP/service path', async () => {
    await seed(accountKey, 7);
    const service = await createAuthService(db, { ...config, delayMaxSeconds: 3 });
    await expect(service.login('backoffuser', password, '127.0.0.1', 'small-cap')).rejects.toMatchObject({
      statusCode: 429,
      retryAfterSeconds: 3,
    });
  });
  it('gives missing and existing accounts the same bounded rejection and retries across origins still see account history', async () => {
    await seed(accountKey, 7);
    await seed(key('login-failure-account', 'unknown'), 7);
    const known = await login();
    const unknown = await login('unknown');
    expect(known.statusCode).toBe(429);
    expect(unknown.statusCode).toBe(429);
    expect(known.json<{ message: string }>().message).toBe(unknown.json<{ message: string }>().message);
    expect((await login('backoffuser', password, '192.0.2.40')).statusCode).toBe(429);
  });
  it('uses origin history independently across account names without logging the source or password', async () => {
    await seed(originKey, 10);
    expect((await login('unknown')).statusCode).toBe(429);
    expect((await login('backoffuser', password)).statusCode).toBe(429);
    expect(capture.raw.join('')).not.toContain(password);
  });
  it('expires delay from database time, clears only the successful account history and preserves origin history', async () => {
    await seed(accountKey, 7, 31);
    await seed(originKey, 5, 31);
    expect((await login('backoffuser', password)).statusCode).toBe(200);
    expect(
      (
        await db.query('SELECT cardinality(attempted_at) AS failures FROM core.auth_buckets WHERE key_hash = $1', [
          accountKey,
        ])
      ).rows[0]?.['failures'],
    ).toBe(0);
    expect(
      (
        await db.query('SELECT cardinality(attempted_at) AS failures FROM core.auth_buckets WHERE key_hash = $1', [
          originKey,
        ])
      ).rows[0]?.['failures'],
    ).toBe(5);
  });
  it('uses a true rolling failure window rather than the old fixed-window metadata', async () => {
    const grant = await login('backoffuser', password);
    expect(grant.statusCode).toBe(200);
    await seed(accountKey, 9, 31);
    await admin.query(
      "UPDATE core.users SET failed_login_count = 9, failed_login_window_started_at = clock_timestamp() - interval '901 seconds' WHERE id = $1",
      [userId],
    );
    expect((await login()).statusCode).toBe(401);
    const state = await db.query(
      'SELECT account_status, failed_login_count, locked_until, state_changed_at FROM core.users WHERE id = $1',
      [userId],
    );
    expect(state.rows[0]?.['account_status']).toBe('locked');
    expect(state.rows[0]?.['failed_login_count']).toBe(10);
    const until = state.rows[0]?.['locked_until'] as Date;
    const changed = state.rows[0]?.['state_changed_at'] as Date;
    expect(until.getTime() - changed.getTime()).toBeLessThanOrEqual(900000);
    const oldAccess = grant.json<{ accessToken: string }>().accessToken;
    expect(
      (await app.inject({ url: '/api/v1/users/me', headers: { authorization: `Bearer ${oldAccess}` } })).statusCode,
    ).toBe(401);
    await seed(accountKey, 10, 31);
    await seed(originKey, 2, 31);
    expect((await login('backoffuser', password)).statusCode).toBe(401);
    expect(
      (await db.query('SELECT locked_until FROM core.users WHERE id = $1', [userId])).rows[0]?.['locked_until'],
    ).toEqual(until);
    expect(
      (await db.query("SELECT id FROM core.audit_events WHERE action = 'account_locked' AND target_id = $1", [userId]))
        .rows,
    ).toHaveLength(1);
  });
  it('automatically unlocks after fixed expiry and audits that transition without an administrator', async () => {
    await seed(accountKey, 10, 901);
    await seed(originKey, 10, 901);
    await admin.query(
      "UPDATE core.users SET account_status = 'locked', locked_until = clock_timestamp() - interval '1 second', state_changed_at = clock_timestamp() - interval '901 seconds', state_reason = 'failed_authentication' WHERE id = $1",
      [userId],
    );
    expect((await login('backoffuser', password)).statusCode).toBe(200);
    expect(
      (await db.query('SELECT account_status, state_reason FROM core.users WHERE id = $1', [userId])).rows[0],
    ).toMatchObject({ account_status: 'active', state_reason: 'lockout_expired' });
    expect(
      (await db.query("SELECT id FROM core.audit_events WHERE action = 'account_unlocked'", [])).rows,
    ).toHaveLength(1);
  });
  it('rolls back the lock, revocation and failure history together if its audit write fails', async () => {
    await seed(accountKey, 9, 31);
    await admin.query(
      "ALTER TABLE core.audit_events ADD CONSTRAINT backoff_test_failure CHECK (action <> 'account_locked') NOT VALID",
    );
    try {
      expect((await login()).statusCode).toBe(500);
      expect(
        (await db.query('SELECT account_status, failed_login_count FROM core.users WHERE id = $1', [userId])).rows[0],
      ).toMatchObject({ account_status: 'active', failed_login_count: 0 });
      expect(
        (
          await db.query('SELECT cardinality(attempted_at) AS failures FROM core.auth_buckets WHERE key_hash = $1', [
            accountKey,
          ])
        ).rows[0]?.['failures'],
      ).toBe(9);
    } finally {
      await admin.query('ALTER TABLE core.audit_events DROP CONSTRAINT backoff_test_failure');
    }
  });
  it('serializes concurrent failure recording, bounds history and prunes expired entries', async () => {
    const backoff = createLoginBackoff(db, config, key);
    await Promise.all(
      Array.from({ length: 12 }, () =>
        identityTransaction(db, async (client) => {
          await client.query('SELECT id FROM core.users WHERE id = $1 FOR UPDATE', [userId]);
          return backoff.record(client, 'backoffuser', '127.0.0.1');
        }),
      ),
    );
    expect(
      (
        await db.query('SELECT cardinality(attempted_at) AS failures FROM core.auth_buckets WHERE key_hash = $1', [
          accountKey,
        ])
      ).rows[0]?.['failures'],
    ).toBe(12);
    await seed(accountKey, 300, 31);
    await identityTransaction(db, (client) => backoff.record(client, 'backoffuser', '127.0.0.1'));
    expect(
      (
        await db.query('SELECT cardinality(attempted_at) AS failures FROM core.auth_buckets WHERE key_hash = $1', [
          accountKey,
        ])
      ).rows[0]?.['failures'],
    ).toBe(300);
    await seed(accountKey, 300, 901);
    await identityTransaction(db, (client) => backoff.record(client, 'backoffuser', '127.0.0.1'));
    expect(
      (
        await db.query('SELECT cardinality(attempted_at) AS failures FROM core.auth_buckets WHERE key_hash = $1', [
          accountKey,
        ])
      ).rows[0]?.['failures'],
    ).toBe(1);
  });
});
