import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createDb, initCluster, type Db } from '@boro-biya/db';
import { createDatabaseFor, injectedPgAdminUrl, type TestDatabaseHandle } from '@boro-biya/test-utils/pg';
import { makeCapturedLog, makeServerConfigFixture } from '@boro-biya/test-utils';
import { createLogger, createMetricsRegistry } from '@boro-biya/server-runtime';
import { accountResponseSchema, sessionListResponseSchema } from '@boro-biya/validation';
import { buildApp } from '../../src/app.js';
import { createAuthService, type AuthService } from '../../src/auth/service.js';
import { readAuthConfig } from '../../src/auth/config.js';
let database: TestDatabaseHandle, db: Db, root: Db, auth: AuthService, app: FastifyInstance;
let ownerId = '',
  foreignId = '',
  csrf = '';
let current: Awaited<ReturnType<AuthService['login']>>, other: typeof current, foreign: typeof current;
const config = readAuthConfig({
  SESSION_SECRET: 'disposable-privacy-acceptance-material',
  WEB_ORIGIN: 'https://example.test',
  LOGIN_MAX_ATTEMPTS_PER_ACCOUNT: '100',
  LOGIN_MAX_ATTEMPTS_PER_ORIGIN: '300',
});
const password = 'Synthetic!orchard782';
const capture = makeCapturedLog();
beforeAll(async () => {
  database = await createDatabaseFor(injectedPgAdminUrl(), 'privacy');
  await initCluster({
    adminConnectionString: database.adminConnectionString,
    passwords: { core: 'privacy-only', relation: 'privacy-only', sos: 'privacy-only' },
    repoRoot: resolve('.'),
  });
  root = createDb({ connectionString: database.adminConnectionString });
  const url = new URL(database.adminConnectionString);
  url.username = 'boro_core';
  url.password = 'privacy-only';
  db = createDb({ connectionString: url.toString() });
  auth = await createAuthService(db, config);
  for (const username of ['privacy_owner', 'privacy_foreign']) {
    const created = await auth.register(
      {
        username,
        password,
        repeatPassword: password,
        answers: [1, 2, 3, 4, 5].map((questionId) => ({ questionId, answer: `private invented answer ${questionId}` })),
      },
      'fixture',
      'fixture',
    );
    if (username === 'privacy_owner') ownerId = created.id;
    else foreignId = created.id;
  }
  app = buildApp({
    config: makeServerConfigFixture(),
    auth,
    registry: createMetricsRegistry(),
    logger: createLogger({ service: 'api', version: 'test', commit: 'test', level: 'debug', sink: capture.sink }),
  });
  csrf = (await app.inject('/api/v1/auth/csrf')).json<{ csrfToken: string }>().csrfToken;
});
beforeEach(async () => {
  await root.query('TRUNCATE core.security_stream_tickets,core.sessions,core.session_families,core.auth_buckets');
  current = await auth.login('privacy_owner', password, 'fixture', 'login');
  other = await auth.login('privacy_owner', password, 'fixture', 'login');
  foreign = await auth.login('privacy_foreign', password, 'fixture', 'login');
});
afterAll(async () => {
  await app?.close();
  await db?.close();
  await root?.close();
  await database?.drop();
});
function request(path: string, token?: string, method: 'GET' | 'DELETE' | 'POST' = 'GET', refresh?: string) {
  return app.inject({
    method,
    url: `/api/v1${path}`,
    headers: {
      origin: config.origin,
      cookie: `boro_csrf=${csrf}${refresh ? `; __Host-boro_refresh=${refresh}` : ''}`,
      'x-csrf-token': csrf,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'x-request-id': 'privacy-revoke',
    },
  });
}
describe('Phase 2 private-by-default account and session acceptance', () => {
  it.each([
    '/users/me',
    '/users/me/preferences',
    '/auth/sessions',
    '/admin/users',
    '/admin/roles',
    '/admin/audit-events',
  ])('does not publish %s without authentication', async (path) => {
    const result = await request(path);
    expect(result.statusCode).toBe(401);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body).not.toContain(ownerId);
    expect(result.body).not.toContain(foreignId);
  });
  it('has no public directory or arbitrary-user profile route, including a known real account ID', async () => {
    for (const token of [undefined, current.accessToken])
      for (const path of [
        '/users',
        `/users/${foreignId}`,
        `/users/${foreignId}/preferences`,
        `/users/${foreignId}/sessions`,
        '/profiles',
        '/locations',
      ]) {
        const result = await request(path, token);
        expect(result.statusCode).toBe(404);
        expect(result.body).not.toContain('privacy_foreign');
      }
  });
  it('exposes only the current account safe projection even when foreign IDs are supplied as query hints', async () => {
    const result = await request(`/users/me?userId=${foreignId}`, current.accessToken);
    expect(result.statusCode).toBe(200);
    const account = accountResponseSchema.parse(result.json());
    expect(account.id).toBe(ownerId);
    expect(account.roles).toEqual(['user']);
    expect(account.permissions).toEqual([]);
    expect(account.preferredLocale).toBe('en');
    for (const value of [foreignId, foreign.refreshToken, password, 'password_hash', 'answer_hash', 'email', 'mobile'])
      expect(result.body).not.toContain(value);
    const preferences = await request(`/users/me/preferences?userId=${foreignId}`, current.accessToken);
    expect(preferences.json()).toEqual({ locale: 'en' });
    for (const path of ['/admin/users', `/admin/users/${foreignId}`, '/admin/roles', '/admin/audit-events'])
      expect((await request(path, current.accessToken)).statusCode).toBe(403);
  });
  it('lists exactly the owner families and only bounded credential-free metadata', async () => {
    const result = await request(`/auth/sessions?userId=${foreignId}`, current.accessToken);
    const listed = sessionListResponseSchema.parse(result.json());
    expect(listed.map((entry) => entry.familyId).sort()).toEqual([current.familyId, other.familyId].sort());
    for (const row of listed)
      expect(Object.keys(row).sort()).toEqual(['expiresAt', 'familyId', 'issuedAt', 'lastSeenAt']);
    for (const value of [
      current.refreshToken,
      other.refreshToken,
      foreign.refreshToken,
      current.accessToken,
      foreign.familyId,
      foreignId,
      password,
    ])
      expect(result.body).not.toContain(value);
    expect(result.headers['cache-control']).toBe('no-store');
  });
  it('rejects cross-user revocation without changing either user and lets the owner revoke a chosen family', async () => {
    expect((await request(`/auth/sessions/${other.familyId}`, foreign.accessToken, 'DELETE')).statusCode).toBe(404);
    expect((await request('/users/me', other.accessToken)).statusCode).toBe(200);
    expect((await request(`/auth/sessions/${other.familyId}`, current.accessToken, 'DELETE')).statusCode).toBe(204);
    expect((await request('/users/me', other.accessToken)).statusCode).toBe(401);
    expect((await request('/auth/refresh', undefined, 'POST', other.refreshToken)).statusCode).toBe(401);
    expect((await request('/users/me', current.accessToken)).statusCode).toBe(200);
    expect((await request('/users/me', foreign.accessToken)).statusCode).toBe(200);
  });
  it('records individual owner revocation atomically with a correlated credential-free audit', async () => {
    expect((await request(`/auth/sessions/${other.familyId}`, current.accessToken, 'DELETE')).statusCode).toBe(204);
    const audit = await root.query(
      "SELECT actor_id,action,target_type,target_id,request_id,details FROM core.audit_events WHERE action='session_revoked' AND target_id=$1",
      [other.familyId],
    );
    expect(audit.rows).toEqual([
      {
        actor_id: ownerId,
        action: 'session_revoked',
        target_type: 'session_family',
        target_id: other.familyId,
        request_id: 'privacy-revoke',
        details: {},
      },
    ]);
  });
  it('does not revoke a family if its required audit cannot be committed', async () => {
    await root.query(
      "ALTER TABLE core.audit_events ADD CONSTRAINT privacy_reject_revoke CHECK (action <> 'session_revoked') NOT VALID",
    );
    try {
      expect((await request(`/auth/sessions/${other.familyId}`, current.accessToken, 'DELETE')).statusCode).toBe(500);
    } finally {
      await root.query('ALTER TABLE core.audit_events DROP CONSTRAINT privacy_reject_revoke');
    }
    expect((await request('/users/me', other.accessToken)).statusCode).toBe(200);
  });
  it('revoke-others preserves the current family and every foreign family', async () => {
    expect((await request('/auth/sessions', current.accessToken, 'DELETE')).statusCode).toBe(204);
    expect((await request('/users/me', other.accessToken)).statusCode).toBe(401);
    expect((await request('/users/me', current.accessToken)).statusCode).toBe(200);
    expect((await request('/users/me', foreign.accessToken)).statusCode).toBe(200);
    expect(
      sessionListResponseSchema
        .parse((await request('/auth/sessions', current.accessToken)).json())
        .map((entry) => entry.familyId),
    ).toEqual([current.familyId]);
  });
  it('lets the owner revoke the current family, immediately denying its bearer and refresh proof', async () => {
    expect((await request(`/auth/sessions/${current.familyId}`, current.accessToken, 'DELETE')).statusCode).toBe(204);
    expect((await request('/users/me', current.accessToken)).statusCode).toBe(401);
    expect((await request('/auth/refresh', undefined, 'POST', current.refreshToken)).statusCode).toBe(401);
    expect((await request('/users/me', other.accessToken)).statusCode).toBe(200);
  });
});
