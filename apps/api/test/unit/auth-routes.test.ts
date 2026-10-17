import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeServerConfigFixture } from '@boro-biya/test-utils';
import { createLogger, createMetricsRegistry } from '@boro-biya/server-runtime';
import { buildApp } from '../../src/app.js';
import { AuthFailure, type AuthService } from '../../src/auth/service.js';
const apps: FastifyInstance[] = [];
const csrf = 'A'.repeat(43);
const grant = {
  accessToken: 'signed',
  refreshToken: 'R'.repeat(43),
  expiresAt: new Date('2030-01-01'),
  userId: 'user',
  sessionId: 'session',
  familyId: 'family',
};
function fixture(secure = true) {
  const auth = {
    config: { origin: 'https://example.test', secureCookies: secure, accessTtlSeconds: 900, recoveryEnabled: true },
    recovery: {
      forgot: vi.fn().mockResolvedValue({ token: 'F'.repeat(43), expiresAt: new Date('2030-01-01') }),
      questions: vi.fn().mockResolvedValue([1, 2, 3].map((id) => ({ id, textKey: `securityQuestions.q${id}` }))),
      verify: vi.fn().mockResolvedValue({ token: 'G'.repeat(43), expiresAt: new Date('2030-01-01') }),
      reset: vi.fn().mockResolvedValue(undefined),
    },
    catalogue: vi.fn().mockResolvedValue([{ id: 1, textKey: 'key' }]),
    register: vi.fn().mockResolvedValue({}),
    login: vi.fn().mockResolvedValue(grant),
    refresh: vi.fn().mockResolvedValue(grant),
    authenticate: vi.fn().mockResolvedValue({ userId: 'user', sessionId: 'session', account: { id: 'user' } }),
    permissions: vi.fn().mockResolvedValue([]),
    roles: vi.fn().mockResolvedValue([]),
    securityNotices: vi.fn().mockResolvedValue([]),
    preferences: vi.fn().mockResolvedValue({ locale: 'en' }),
    savePreferences: vi.fn().mockResolvedValue({ locale: 'fa' }),
    changeSecurityAnswers: vi.fn().mockResolvedValue(undefined),
    changePassword: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    revokeOthers: vi.fn().mockResolvedValue(undefined),
    sessions: {
      list: vi.fn().mockResolvedValue([
        {
          familyId: 'family',
          issuedAt: new Date('2026-01-01'),
          expiresAt: new Date('2030-01-01'),
          lastSeenAt: new Date('2026-01-01'),
        },
      ]),
      revoke: vi.fn().mockResolvedValue(true),
    },
  };
  const app = buildApp({
    config: makeServerConfigFixture(),
    registry: createMetricsRegistry(),
    logger: createLogger({ service: 'api', version: 'test', commit: 'test', level: 'error', sink: () => {} }),
    auth: auth as unknown as AuthService,
  });
  apps.push(app);
  const headers = {
    origin: auth.config.origin,
    cookie: `boro_csrf=${csrf}; ${secure ? '__Host-boro_refresh' : 'boro_refresh'}=${grant.refreshToken}`,
    'x-csrf-token': csrf,
    authorization: 'Bearer signed',
  };
  return { app, auth, headers };
}
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

describe('HTTP authentication/CSRF cookie boundaries', () => {
  it('issues CSRF, catalogue and policy without sign-in', async () => {
    const { app } = fixture();
    for (const path of ['csrf', 'security-questions', 'policy'])
      expect((await app.inject(`/api/v1/auth/${path}`)).statusCode).toBe(200);
  });
  it('rejects missing/hostile/forged/ambiguous/non-ASCII CSRF without leaking a server exception', async () => {
    const { app, headers } = fixture();
    for (const patch of [
      { origin: 'https://evil.test' },
      { 'x-csrf-token': 'wrong' },
      { cookie: '' },
      { cookie: `boro_csrf=${'é'.repeat(43)}` },
      { cookie: `boro_csrf=${csrf}; boro_csrf=${csrf}` },
    ]) {
      const response = await app.inject({
        url: '/api/v1/auth/refresh',
        method: 'POST',
        headers: { ...headers, ...patch },
      });
      expect(response.statusCode).toBe(403);
    }
    expect((await app.inject({ url: '/api/v1/auth/login', method: 'POST', payload: {} })).statusCode).toBe(403);
  });
  it('validates input before invoking service and serves accepted registration', async () => {
    const { app, auth, headers } = fixture();
    for (const url of ['login', 'register'])
      expect((await app.inject({ url: `/api/v1/auth/${url}`, method: 'POST', headers, payload: {} })).statusCode).toBe(
        400,
      );
    expect(auth.login).not.toHaveBeenCalled();
    expect(auth.register).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          url: '/api/v1/auth/register',
          method: 'POST',
          headers,
          payload: {
            username: 'alice',
            password: 'secret',
            repeatPassword: 'secret',
            answers: [1, 2, 3, 4, 5].map((questionId) => ({ questionId, answer: 'a' })),
          },
        })
      ).statusCode,
    ).toBe(201);
  });
  it('logs in, refreshes, uses a dev cookie only in explicit insecure mode and keeps refresh out of JSON', async () => {
    const { app, headers } = fixture(false);
    const login = await app.inject({
      url: '/api/v1/auth/login',
      method: 'POST',
      headers,
      payload: { username: 'alice', password: 'password' },
    });
    expect(login.statusCode).toBe(200);
    expect(login.body).not.toContain(grant.refreshToken);
    expect(String(login.headers['set-cookie'])).toContain('boro_refresh=');
    expect(String(login.headers['set-cookie'])).not.toContain('Secure');
    expect((await app.inject({ url: '/api/v1/auth/refresh', method: 'POST', headers })).statusCode).toBe(200);
    expect(
      (
        await app.inject({
          url: '/api/v1/auth/refresh',
          method: 'POST',
          headers: { ...headers, cookie: `boro_csrf=${csrf}` },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('uses the bearer identity for locale preferences and rejects unsupported/mass-assigned fields', async () => {
    const { app, auth, headers } = fixture();
    expect((await app.inject({ url: '/api/v1/users/me/preferences', headers })).json()).toEqual({ locale: 'en' });
    for (const payload of [{ locale: 'de' }, { locale: 'fa', userId: 'other' }, {}])
      expect(
        (await app.inject({ url: '/api/v1/users/me/preferences', method: 'PUT', headers, payload })).statusCode,
      ).toBe(400);
    expect(
      (
        await app.inject({ url: '/api/v1/users/me/preferences', method: 'PUT', headers, payload: { locale: 'fa' } })
      ).json(),
    ).toEqual({ locale: 'fa' });
    expect(auth.savePreferences).toHaveBeenCalledWith('user', 'session', 'fa');
  });
  it('publishes bounded Retry-After without exposing account state or internal prose', async () => {
    const { app, auth, headers } = fixture();
    auth.login.mockRejectedValueOnce(new AuthFailure(429, 8));
    const response = await app.inject({
      url: '/api/v1/auth/login',
      method: 'POST',
      headers,
      payload: { username: 'alice', password: 'wrong' },
    });
    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('8');
    expect(response.body).not.toContain('alice');
  });
  it('validates bearer password-change input and clears the refresh cookie only after success', async () => {
    const { app, auth, headers } = fixture();
    expect(
      (await app.inject({ url: '/api/v1/auth/password/change', method: 'POST', headers, payload: {} })).statusCode,
    ).toBe(400);
    expect(auth.changePassword).not.toHaveBeenCalled();
    const response = await app.inject({
      url: '/api/v1/auth/password/change',
      method: 'POST',
      headers,
      payload: { currentPassword: 'old', password: 'new', repeatPassword: 'new' },
    });
    expect(response.statusCode).toBe(200);
    expect(String(response.headers['set-cookie'])).toContain('Max-Age=0');
    expect(auth.changePassword.mock.calls[0]?.at(-1)).toBe('127.0.0.1');
  });
  it('lists safe sessions, revokes only through the current identity, and clears logout cookie', async () => {
    const { app, auth, headers } = fixture();
    expect((await app.inject({ url: '/api/v1/users/me', headers })).statusCode).toBe(200);
    const list = await app.inject({ url: '/api/v1/auth/sessions', headers });
    expect(list.body).toContain('2026-01-01T00:00:00.000Z');
    expect(
      (
        await app.inject({
          url: '/api/v1/auth/sessions/family',
          method: 'DELETE',
          headers: { ...headers, 'x-request-id': 'session-revoke-unit' },
        })
      ).statusCode,
    ).toBe(204);
    expect(auth.sessions.revoke).toHaveBeenCalledWith('user', 'family', 'session', 'session-revoke-unit');
    auth.sessions.revoke.mockResolvedValueOnce(false);
    expect((await app.inject({ url: '/api/v1/auth/sessions/other', method: 'DELETE', headers })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/v1/auth/sessions', method: 'DELETE', headers })).statusCode).toBe(204);
    const logout = await app.inject({ url: '/api/v1/auth/logout', method: 'POST', headers });
    expect(logout.statusCode).toBe(204);
    expect(String(logout.headers['set-cookie'])).toContain('Max-Age=0');
    auth.authenticate.mockRejectedValueOnce(new AuthFailure());
    expect((await app.inject({ url: '/api/v1/users/me', headers })).statusCode).toBe(401);
  });
});

describe('recovery HTTP proof boundaries', () => {
  it.each([true, false])('keeps flow and grant proofs in HTTP-only cookies (secure=%s)', async (secure) => {
    const { app, headers, auth } = fixture(secure);
    const prefix = secure ? '__Host-' : '';
    const send = (path: string, payload?: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: `/api/v1/auth/password/${path}`,
        headers,
        ...(payload === undefined ? {} : { payload }),
      });
    const forgot = await send('forgot', { username: 'alice' });
    expect(forgot.statusCode).toBe(200);
    expect(forgot.json()).toEqual({ accepted: true });
    expect(forgot.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining(`${prefix}boro_recovery=${'F'.repeat(43)}; HttpOnly`)]),
    );
    const verify = await send('recover/verify', {
      answers: [1, 2, 3].map((questionId) => ({ questionId, answer: 'answer' })),
    });
    expect(verify.statusCode).toBe(200);
    expect(String(verify.headers['set-cookie'])).toContain(`${prefix}boro_reset=${'G'.repeat(43)}; HttpOnly`);
    expect(String(verify.headers['set-cookie'])).toContain('SameSite=Strict');
    expect(String(verify.headers['set-cookie']).includes('; Secure')).toBe(secure);
    expect(verify.json()).toEqual({ accepted: true });
    expect((await send('recover/questions')).statusCode).toBe(200);
    const reset = await send('recover/reset', { password: 'Sailing!violet782', repeatPassword: 'Sailing!violet782' });
    expect(reset.statusCode).toBe(200);
    expect(reset.headers['set-cookie']).toHaveLength(3);
    expect(auth.recovery.reset).toHaveBeenCalled();
  });
  it('rejects every recovery mutation without CSRF and rejects unknown input fields', async () => {
    const { app, headers, auth } = fixture();
    for (const path of ['forgot', 'recover/questions', 'recover/verify', 'recover/reset']) {
      const result = await app.inject({ method: 'POST', url: `/api/v1/auth/password/${path}`, payload: {} });
      expect(result.statusCode).toBe(403);
    }
    for (const [path, payload] of [
      ['forgot', { username: 'alice', grant: 'injected' }],
      ['recover/verify', { answers: [] }],
      ['recover/reset', { password: 'x', repeatPassword: 'x', grant: 'injected' }],
    ] as const) {
      expect(
        (await app.inject({ method: 'POST', url: `/api/v1/auth/password/${path}`, headers, payload })).statusCode,
      ).toBe(400);
    }
    expect(auth.recovery.forgot).not.toHaveBeenCalled();
    expect(auth.recovery.verify).not.toHaveBeenCalled();
    expect(auth.recovery.reset).not.toHaveBeenCalled();
  });
});

it('validates security-answer replacement, forwards only authenticated ownership and clears proof cookies', async () => {
  const { app, auth, headers } = fixture();
  const payload = {
    currentPassword: 'secret',
    answers: [1, 2, 3, 4, 5].map((questionId) => ({ questionId, answer: 'new answer' })),
  };
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/security-questions/change',
    headers,
    payload,
  });
  expect(response.statusCode).toBe(200);
  expect(response.headers['set-cookie']).toHaveLength(3);
  expect(auth.changeSecurityAnswers).toHaveBeenCalledWith(
    'user',
    'session',
    'secret',
    payload.answers,
    expect.any(String),
    expect.any(String),
  );
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/security-questions/change',
        headers,
        payload: { ...payload, userId: 'other' },
      })
    ).statusCode,
  ).toBe(400);
  auth.authenticate.mockRejectedValueOnce(new AuthFailure());
  expect(
    (await app.inject({ method: 'POST', url: '/api/v1/auth/security-questions/change', headers, payload })).statusCode,
  ).toBe(401);
});
