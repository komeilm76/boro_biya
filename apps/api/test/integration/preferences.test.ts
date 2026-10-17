import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createDb, initCluster, type Db } from '@boro-biya/db';
import { createDatabaseFor, injectedPgAdminUrl, type TestDatabaseHandle } from '@boro-biya/test-utils/pg';
import { makeServerConfigFixture } from '@boro-biya/test-utils';
import { createLogger, createMetricsRegistry } from '@boro-biya/server-runtime';
import { createAuthService, type AuthService } from '../../src/auth/service.js';
import { createPasswordHasher } from '../../src/auth/passwords.js';
import { readAuthConfig } from '../../src/auth/config.js';
import { createIdentityRepository } from '../../src/identity/repository.js';
import { buildApp } from '../../src/app.js';

const config = readAuthConfig({
  SESSION_SECRET: 'disposable-preferences-test-signing-material',
  WEB_ORIGIN: 'https://example.test',
  NODE_ENV: 'test',
});
const native = createPasswordHasher();
const password = 'Sailing!violet782';
function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let pause: { entered: ReturnType<typeof deferred>; resume: ReturnType<typeof deferred> } | undefined;
let database: TestDatabaseHandle;
let admin: Db;
let db: Db;
let app: FastifyInstance;
let auth: AuthService;
let userId = '';
let originalHash = '';
let registrationLocale = '';
beforeAll(async () => {
  database = await createDatabaseFor(injectedPgAdminUrl(), 'preferences');
  await initCluster({
    adminConnectionString: database.adminConnectionString,
    passwords: { core: 'preferences-test-only', relation: 'preferences-test-only', sos: 'preferences-test-only' },
    repoRoot: resolve('.'),
  });
  admin = createDb({ connectionString: database.adminConnectionString });
  const url = new URL(database.adminConnectionString);
  url.username = 'boro_core';
  url.password = 'preferences-test-only';
  db = createDb({ connectionString: url.toString() });
  auth = await createAuthService(db, config, {
    verify: (encoded, value) => native.verify(encoded, value),
    async hash(value) {
      if (value === 'Another!violet42' && pause) {
        pause.entered.resolve();
        await pause.resume.promise;
      }
      return native.hash(value);
    },
  });
  userId = (
    await auth.register(
      {
        username: 'Alice',
        password,
        repeatPassword: password,
        locale: 'fa',
        answers: [1, 2, 3, 4, 5].map((questionId) => ({ questionId, answer: `invented ${questionId}` })),
      },
      'setup',
      'setup',
    )
  ).id;
  registrationLocale = (await auth.preferences(userId)).locale;
  originalHash = (
    await db.pool.query<{ password_hash: string }>('SELECT password_hash FROM core.users WHERE id = $1', [userId])
  ).rows[0]!.password_hash;
  app = buildApp({
    config: makeServerConfigFixture(),
    auth,
    registry: createMetricsRegistry(),
    logger: createLogger({ service: 'api', version: 'test', commit: 'test', level: 'error', sink: () => {} }),
  });
});
beforeEach(async () => {
  pause = undefined;
  await admin.query('TRUNCATE core.auth_buckets, core.audit_events');
  await admin.query(
    "UPDATE core.users SET password_hash = $2, account_status = 'active', locked_until = NULL, password_setup_required = false, security_setup_required = false, state_reason = NULL WHERE id = $1",
    [userId, originalHash],
  );
  await admin.query(
    "UPDATE core.session_families SET revoked_at = clock_timestamp(), revocation_reason = 'test_reset' WHERE revoked_at IS NULL",
  );
  await admin.query(
    "INSERT INTO core.user_preferences(user_id, locale) VALUES ($1, 'fa') ON CONFLICT (user_id) DO UPDATE SET locale = 'fa'",
    [userId],
  );
});
afterAll(async () => {
  pause?.resume.resolve();
  await app?.close();
  await db?.close();
  await admin?.close();
  await database?.drop();
});
function request(token: string, method: 'GET' | 'PUT' = 'GET', payload?: unknown) {
  return app.inject({
    url: '/api/v1/users/me/preferences',
    method,
    headers: { authorization: `Bearer ${token}` },
    ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
  });
}
describe('account locale persistence and mutation authorization races (UI-28, SEC-10)', () => {
  it('persists registration choice atomically, validates updates and restores it in another service instance', async () => {
    expect(registrationLocale).toBe('fa');
    const grant = await auth.login('Alice', password, '127.0.0.1', 'login');
    expect((await request(grant.accessToken)).json()).toEqual({ locale: 'fa' });
    for (const body of [{ locale: 'de' }, { locale: 'fa', userId: 'other' }, { locale: 'fa', roles: ['admin'] }])
      expect((await request(grant.accessToken, 'PUT', body)).statusCode).toBe(400);
    expect((await request(grant.accessToken, 'PUT', { locale: 'en' })).json()).toEqual({ locale: 'en' });
    const restarted = await createAuthService(db, config);
    expect(await restarted.preferences(userId)).toEqual({ locale: 'en' });
    expect(
      (await app.inject({ url: '/api/v1/users/me', headers: { authorization: `Bearer ${grant.accessToken}` } })).json<{
        preferredLocale: string;
      }>().preferredLocale,
    ).toBe('en');
    expect((await request('invalid')).statusCode).toBe(401);
  });
  it('defaults legacy accounts to English and never changes another account preference', async () => {
    const other = await createIdentityRepository(db).create({
      username: 'Other',
      passwordHash: originalHash,
      passwordSetupRequired: false,
      securitySetupRequired: false,
    });
    expect(await auth.preferences(other.id)).toEqual({ locale: 'en' });
    const grant = await auth.login('Other', password, '127.0.0.1', 'login');
    await request(grant.accessToken, 'PUT', { locale: 'en' });
    expect(await auth.preferences(userId)).toEqual({ locale: 'fa' });
  });
  it('rolls back identity creation when the database rejects an invalid locale', async () => {
    await expect(
      createIdentityRepository(db).create({
        username: 'Badlocale',
        passwordHash: originalHash,
        passwordSetupRequired: false,
        securitySetupRequired: false,
        locale: 'de' as 'en',
      }),
    ).rejects.toThrow();
    expect((await db.query("SELECT id FROM core.users WHERE username_normalized = 'badlocale'")).rows).toHaveLength(0);
  });
  it('rejects locked, banned, deactivated and setup-incomplete bindings across current protected route classes', async () => {
    for (const state of ['locked', 'banned', 'deactivated', 'password', 'security']) {
      await admin.query(
        "UPDATE core.users SET account_status = 'active', locked_until = NULL, password_setup_required = false, security_setup_required = false WHERE id = $1",
        [userId],
      );
      const grant = await auth.login('Alice', password, '127.0.0.1', 'login');
      await admin.query(
        `UPDATE core.users SET account_status = $2, state_reason = 'test',
        locked_until = CASE WHEN $2 = 'locked' THEN clock_timestamp() + interval '900 seconds' ELSE NULL END,
        password_setup_required = $3, security_setup_required = $4 WHERE id = $1`,
        [
          userId,
          ['password', 'security'].includes(state) ? 'active' : state,
          state === 'password',
          state === 'security',
        ],
      );
      expect((await request(grant.accessToken)).statusCode).toBe(401);
      expect((await request(grant.accessToken, 'PUT', { locale: 'en' })).statusCode).toBe(401);
      for (const [method, url] of [
        ['GET', '/api/v1/users/me'],
        ['GET', '/api/v1/auth/sessions'],
        ['DELETE', '/api/v1/auth/sessions'],
        ['DELETE', `/api/v1/auth/sessions/${grant.familyId}`],
        ['POST', '/api/v1/auth/password/change'],
      ] as const) {
        expect(
          (await app.inject({ method, url, headers: { authorization: `Bearer ${grant.accessToken}` } })).statusCode,
        ).toBe(401);
      }
      const csrf = (await app.inject('/api/v1/auth/csrf')).json<{ csrfToken: string }>().csrfToken;
      const headers = {
        origin: config.origin,
        cookie: `boro_csrf=${csrf}; __Host-boro_refresh=${grant.refreshToken}`,
        'x-csrf-token': csrf,
      };
      expect((await app.inject({ url: '/api/v1/auth/refresh', method: 'POST', headers })).statusCode).toBe(401);
      // Signing out must remain possible even when normal feature access is denied.
      expect((await app.inject({ url: '/api/v1/auth/logout', method: 'POST', headers })).statusCode).toBe(204);
    }
  });
  it('denies stale authenticated contexts after logout without revoking an independent session', async () => {
    const first = await auth.login('Alice', password, '127.0.0.1', 'first');
    const context = await auth.authenticate(`Bearer ${first.accessToken}`);
    const other = await auth.login('Alice', password, '127.0.0.1', 'other');
    await auth.logout(first.refreshToken, 'logout');
    await expect(auth.savePreferences(context.userId, context.sessionId, 'en')).rejects.toMatchObject({
      statusCode: 401,
    });
    await expect(auth.revokeOthers(context.userId, context.sessionId, 'stale')).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(await auth.sessions.revoke(context.userId, other.familyId, context.sessionId)).toBe(false);
    expect(await auth.sessions.isActive(other.userId, other.sessionId)).toBe(true);
    expect(await auth.preferences(userId)).toEqual({ locale: 'fa' });
  });
  it('honours individual generation expiry even while the family remains unexpired', async () => {
    const grant = await auth.login('Alice', password, '127.0.0.1', 'login');
    await admin.query(
      "UPDATE core.sessions SET issued_at = clock_timestamp() - interval '2 days', expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
      [grant.sessionId],
    );
    expect(await auth.sessions.isActive(userId, grant.sessionId)).toBe(false);
    expect(await auth.sessions.rotate(grant.refreshToken)).toBeNull();
    expect(await auth.sessions.list(userId)).toHaveLength(0);
    await expect(auth.savePreferences(userId, grant.sessionId, 'en')).rejects.toMatchObject({ statusCode: 401 });
  });
  it('rechecks the binding after slow password hashing so logout cannot be undone by an in-flight change', async () => {
    const grant = await auth.login('Alice', password, '127.0.0.1', 'login');
    pause = { entered: deferred(), resume: deferred() };
    const pending = auth.changePassword(
      userId,
      grant.sessionId,
      password,
      'Another!violet42',
      'Another!violet42',
      'racing',
    );
    try {
      await pause.entered.promise;
      await auth.logout(grant.refreshToken, 'logout');
      pause.resume.resolve();
      await expect(pending).rejects.toMatchObject({ statusCode: 401 });
      const stored = (
        await db.pool.query<{ password_hash: string }>('SELECT password_hash FROM core.users WHERE id = $1', [userId])
      ).rows[0]!.password_hash;
      expect(stored).toBe(originalHash);
      expect((await db.query("SELECT id FROM core.audit_events WHERE action = 'password_changed'")).rows).toHaveLength(
        0,
      );
    } finally {
      pause.resume.resolve();
      await pending.catch(() => undefined);
    }
  });
});
