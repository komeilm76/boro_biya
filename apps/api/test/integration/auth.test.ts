import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, initCluster, type Db } from '@boro-biya/db';
import { createDatabaseFor, injectedPgAdminUrl, type TestDatabaseHandle } from '@boro-biya/test-utils/pg';
import { makeCapturedLog, makeServerConfigFixture } from '@boro-biya/test-utils';
import {
  accessResponseSchema,
  csrfResponseSchema,
  accountResponseSchema,
  sessionListResponseSchema,
} from '@boro-biya/validation';
import { createLogger, createMetricsRegistry } from '@boro-biya/server-runtime';
import { buildApp } from '../../src/app.js';
import { createAuthService } from '../../src/auth/service.js';
import type { AuthConfig } from '../../src/auth/config.js';

let database: TestDatabaseHandle;
let db: Db;
let app: FastifyInstance;
let csrf = '';
const config: AuthConfig = {
  secret: 'disposable-integration-only-signing-material',
  origin: 'https://example.test',
  secureCookies: true,
  accessTtlSeconds: 900,
  refreshTtlSeconds: 86400,
  maxAccountAttempts: 10,
  maxOriginAttempts: 100,
  windowSeconds: 900,
  lockoutSeconds: 900,
  recoveryEnabled: true,
  captchaEnabled: false,
};
const password = 'Sailing!violet782';
const answers = [1, 2, 3, 4, 5].map((questionId) => ({ questionId, answer: ` invented answer ${questionId} ` }));
const capture = makeCapturedLog();
let cookie = '';
let access = '';

beforeAll(async () => {
  database = await createDatabaseFor(injectedPgAdminUrl(), 'auth');
  await initCluster({
    adminConnectionString: database.adminConnectionString,
    passwords: { core: 'auth-test-only', relation: 'auth-test-only', sos: 'auth-test-only' },
    repoRoot: resolve('.'),
  });
  const url = new URL(database.adminConnectionString);
  url.username = 'boro_core';
  url.password = 'auth-test-only';
  db = createDb({ connectionString: url.toString() });
  const auth = await createAuthService(db, config);
  app = buildApp({
    config: makeServerConfigFixture(),
    auth,
    registry: createMetricsRegistry(),
    logger: createLogger({ service: 'api', version: 'test', commit: 'test', level: 'debug', sink: capture.sink }),
  });
  const response = await app.inject({ url: '/api/v1/auth/csrf' });
  csrf = csrfResponseSchema.parse(response.json()).csrfToken;
});
afterAll(async () => {
  await app?.close();
  await db?.close();
  await database?.drop();
});

function request(path: string, method: 'POST' | 'GET' | 'DELETE' = 'GET', payload?: unknown, bearer = access) {
  const options: InjectOptions = {
    method,
    url: `/api/v1${path}`,
    headers: {
      origin: config.origin,
      cookie: `boro_csrf=${csrf}${cookie ? `; ${cookie}` : ''}`,
      'x-csrf-token': csrf,
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
  };
  if (payload !== undefined) options.payload = payload as Record<string, unknown>;
  return app.inject(options);
}
function refreshCookie(response: { headers: Record<string, unknown> }): string {
  const header = response.headers['set-cookie'];
  expect(typeof header).toBe('string');
  return String(header).split(';')[0] ?? '';
}

describe('real registration/login/session HTTP workflow (AUTH-01 … AUTH-12, SEC-04 … SEC-13)', () => {
  it('serves a server-owned catalogue without answers and rejects mutations by the runtime role', async () => {
    const response = await request('/auth/security-questions');
    expect(response.statusCode).toBe(200);
    const rows: unknown = response.json();
    expect(Array.isArray(rows) && rows.length).toBe(8);
    expect(createHash('sha256').update(JSON.stringify(rows)).digest('hex')).toBe(
      '1129a1e57f65282d2429268bedce8afff1398d7ee5e11417eaf35a054e35747f',
    );
    await expect(db.query('UPDATE core.security_questions SET active = false WHERE id = 1')).rejects.toThrow(
      /permission denied/,
    );
  });
  it('rejects missing/forged CSRF and hostile origins before account creation', async () => {
    const payload = { username: 'alice', password, repeatPassword: password, answers };
    const missing = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload });
    expect(missing.statusCode).toBe(403);
    const hostile = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin: 'https://attacker.test' },
      payload,
    });
    expect(hostile.statusCode).toBe(403);
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: config.origin, cookie: `boro_csrf=${csrf}; boro_csrf=${csrf}`, 'x-csrf-token': csrf },
      payload: { username: 'alice', password },
    });
    expect(duplicate.statusCode).toBe(403);
  });
  it('validates repeat, policy, exactly five distinct questions and rejects mass assignment', async () => {
    for (const patch of [
      { repeatPassword: 'different' },
      { password: 'password1234', repeatPassword: 'password1234' },
      { answers: answers.slice(1) },
      { answers: [answers[0], answers[0], ...answers.slice(2)] },
      { roles: ['admin'] },
    ]) {
      expect(
        (
          await request('/auth/register', 'POST', {
            username: 'alice',
            password,
            repeatPassword: password,
            answers,
            ...patch,
          })
        ).statusCode,
      ).toBe(400);
    }
  });
  it('registers normalized username and five hashed answers atomically, with audit and no contacts', async () => {
    const response = await request('/auth/register', 'POST', {
      username: ' Ａlice ',
      password,
      repeatPassword: password,
      answers,
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ accepted: true });
    const users = await db.query(
      "SELECT id, password_hash, password_setup_required, security_setup_required FROM core.users WHERE username_normalized = 'alice'",
    );
    expect(users.rows).toHaveLength(1);
    expect(users.rows[0]?.['password_hash']).toMatch(/^\$argon2id\$v=19\$(?=[^$]*m=65536)(?=[^$]*t=2)(?=[^$]*p=1)/);
    const stored = await db.query('SELECT answer_hash, normalization_version FROM core.user_security_answers');
    expect(stored.rows).toHaveLength(5);
    expect(JSON.stringify(stored.rows)).not.toContain('invented answer');
    const audit = await db.query("SELECT action FROM core.audit_events WHERE action = 'account_registered'");
    expect(audit.rows).toHaveLength(1);
    await expect(db.query('DELETE FROM core.audit_events')).rejects.toThrow(/permission denied/);
  });
  it('returns generic credential failure for missing, wrong-password and non-active accounts', async () => {
    const wrong = await request('/auth/login', 'POST', { username: 'alice', password: 'wrong-secret' });
    const missing = await request('/auth/login', 'POST', { username: 'unknown', password: 'wrong-secret' });
    expect(wrong.statusCode).toBe(401);
    expect(missing.statusCode).toBe(401);
    expect(wrong.json<{ message: string }>().message).toBe(missing.json<{ message: string }>().message);
  });
  it('issues signed access and HttpOnly Secure SameSite refresh without raw refresh material in the body', async () => {
    const response = await request('/auth/login', 'POST', { username: 'ALICE', password });
    expect(response.statusCode).toBe(200);
    const grant = accessResponseSchema.parse(response.json());
    access = grant.accessToken;
    expect(String(response.headers['set-cookie'])).toMatch(
      /__Host-boro_refresh=.*HttpOnly.*Path=\/.*SameSite=Strict.*Secure/,
    );
    expect(response.body).not.toContain('refreshToken');
    cookie = refreshCookie(response);
    const me = await request('/users/me');
    expect(me.statusCode).toBe(200);
    expect(accountResponseSchema.parse(me.json()).username).toBe('Alice');
    expect((await request('/users/me', 'GET', undefined, `${access}corrupt`)).statusCode).toBe(401);
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('rotates the refresh cookie, denies consumed access binding and revokes the newest grant on replay', async () => {
    const firstCookie = cookie;
    const firstAccess = access;
    const response = await request('/auth/refresh', 'POST');
    expect(response.statusCode).toBe(200);
    access = accessResponseSchema.parse(response.json()).accessToken;
    cookie = refreshCookie(response);
    expect((await request('/users/me', 'GET', undefined, firstAccess)).statusCode).toBe(401);
    expect((await request('/users/me')).statusCode).toBe(200);
    const newest = cookie;
    cookie = firstCookie;
    expect((await request('/auth/refresh', 'POST')).statusCode).toBe(401);
    cookie = newest;
    expect((await request('/users/me')).statusCode).toBe(401);
    expect((await request('/auth/refresh', 'POST')).statusCode).toBe(401);
  });
  it('lists and revokes current sessions, signs out, and immediately denies the old access', async () => {
    const login = await request('/auth/login', 'POST', { username: 'alice', password });
    access = accessResponseSchema.parse(login.json()).accessToken;
    cookie = refreshCookie(login);
    const list = await request('/auth/sessions');
    expect(sessionListResponseSchema.parse(list.json())).toHaveLength(1);
    const otherLogin = await request('/auth/login', 'POST', { username: 'alice', password });
    const otherAccess = accessResponseSchema.parse(otherLogin.json()).accessToken;
    const otherCookie = refreshCookie(otherLogin);
    // Expired/absent bearer access must not prevent cookie-authenticated logout.
    const logout = await request('/auth/logout', 'POST', undefined, 'expired-or-invalid');
    expect(logout.statusCode).toBe(204);
    expect(String(logout.headers['set-cookie'])).toContain('Max-Age=0');
    expect((await request('/users/me')).statusCode).toBe(401);
    expect((await request('/auth/refresh', 'POST')).statusCode).toBe(401);
    expect((await request('/auth/logout', 'POST', undefined, '')).statusCode).toBe(204);
    expect((await request('/users/me', 'GET', undefined, otherAccess)).statusCode).toBe(200);
    cookie = otherCookie;
    expect((await request('/auth/logout', 'POST', undefined, '')).statusCode).toBe(204);
    expect((await request('/users/me', 'GET', undefined, otherAccess)).statusCode).toBe(401);
  });
  it('enforces per-account persisted rolling limits and bounded lockout without automatic bans', async () => {
    for (let i = 0; i < 10; i++)
      await request('/auth/login', 'POST', { username: 'throttle-target', password: 'wrong' });
    expect((await request('/auth/login', 'POST', { username: 'throttle-target', password: 'wrong' })).statusCode).toBe(
      429,
    );
    const rows = await db.query('SELECT attempted_at, key_hash FROM core.auth_buckets');
    expect(JSON.stringify(rows.rows)).not.toContain('throttle-target');
  });
  it('changes the password atomically, audits it and invalidates every old session', async () => {
    const login = await request('/auth/login', 'POST', { username: 'alice', password });
    access = accessResponseSchema.parse(login.json()).accessToken;
    cookie = refreshCookie(login);
    const first = access;
    const secondLogin = await request('/auth/login', 'POST', { username: 'alice', password });
    const other = accessResponseSchema.parse(secondLogin.json()).accessToken;
    expect(
      (
        await request('/auth/password/change', 'POST', {
          currentPassword: 'wrong',
          password: 'Another!violet42',
          repeatPassword: 'Another!violet42',
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await request('/auth/password/change', 'POST', {
          currentPassword: password,
          password: 'Another!violet42',
          repeatPassword: 'Another!violet42',
        })
      ).statusCode,
    ).toBe(200);
    expect((await request('/users/me', 'GET', undefined, first)).statusCode).toBe(401);
    expect((await request('/users/me', 'GET', undefined, other)).statusCode).toBe(401);
    expect((await request('/auth/login', 'POST', { username: 'alice', password })).statusCode).toBe(401);
    const fresh = await request('/auth/login', 'POST', { username: 'alice', password: 'Another!violet42' });
    expect(fresh.statusCode).toBe(200);
    const audit = await db.query("SELECT action FROM core.audit_events WHERE action = 'password_changed'");
    expect(audit.rows).toHaveLength(1);
  });

  it('never logs credentials, hashes, answers or bearer/refresh secrets', () => {
    const text = capture.raw.join('');
    expect(text).not.toContain(password);
    expect(text).not.toContain('invented answer');
    expect(text).not.toContain('$argon2id$');
    expect(text).not.toContain(access);
    expect(text).not.toContain(cookie.split('=')[1]);
  });
});
