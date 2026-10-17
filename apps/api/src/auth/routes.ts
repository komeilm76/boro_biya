import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  loginSchema,
  registrationSchema,
  passwordChangeSchema,
  preferencesSchema,
  recoveryStartSchema,
  recoveryAnswersSchema,
  recoveryResetSchema,
  securityAnswersChangeSchema,
} from '@boro-biya/validation';
import { AuthFailure, type AuthService } from './service.js';

function cookies(request: FastifyRequest): Map<string, string> {
  const entries = new Map<string, string>();
  for (const segment of (request.headers.cookie ?? '').split(';')) {
    const at = segment.indexOf('=');
    if (at < 1) continue;
    const name = segment.slice(0, at).trim();
    // Ambiguous duplicate cookies are rejected, never chosen by ordering.
    if (entries.has(name)) throw new AuthFailure(403);
    entries.set(name, segment.slice(at + 1).trim());
  }
  return entries;
}

/** HTTP adapter: signed bearer access, HttpOnly refresh, strict-origin double-submit CSRF.
 * Credentials never appear in response bodies, except the short-lived bearer access token.
 */
export function applyAuthRoutes(app: FastifyInstance, auth: AuthService): void {
  const refreshName = auth.config.secureCookies ? '__Host-boro_refresh' : 'boro_refresh';
  const flowName = auth.config.secureCookies ? '__Host-boro_recovery' : 'boro_recovery';
  const grantName = auth.config.secureCookies ? '__Host-boro_reset' : 'boro_reset';
  const suffix = `; Path=/; SameSite=Strict${auth.config.secureCookies ? '; Secure' : ''}`;
  function csrf(request: FastifyRequest) {
    if (request.headers.origin !== auth.config.origin) throw new AuthFailure(403);
    const supplied = request.headers['x-csrf-token'];
    const cookie = cookies(request).get('boro_csrf');
    if (
      typeof supplied !== 'string' ||
      cookie === undefined ||
      !/^[A-Za-z0-9_-]{43}$/.test(cookie) ||
      !/^[A-Za-z0-9_-]{43}$/.test(supplied) ||
      supplied.length !== cookie.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(cookie))
    )
      throw new AuthFailure(403);
  }
  function setRefresh(reply: FastifyReply, secret: string, expires: Date) {
    reply.header('set-cookie', `${refreshName}=${secret}; HttpOnly; Expires=${expires.toUTCString()}${suffix}`);
  }
  app.addHook('onError', async (_request, reply, error) => {
    if (error instanceof AuthFailure && error.retryAfterSeconds !== undefined)
      reply.header('retry-after', error.retryAfterSeconds);
  });
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/api/v1/auth') || request.url.startsWith('/api/v1/users/me')) {
      reply.header('cache-control', 'no-store');
      // No cross-origin credential requests even before parsing the body.
      if (request.headers.origin !== undefined && request.headers.origin !== auth.config.origin)
        throw new AuthFailure(403);
    }
  });
  app.get('/api/v1/auth/csrf', (_request, reply) => {
    const csrfToken = randomBytes(32).toString('base64url');
    reply.header('set-cookie', `boro_csrf=${csrfToken}${suffix}`);
    return { csrfToken };
  });
  app.get('/api/v1/auth/security-questions', async () => auth.catalogue());
  app.get('/api/v1/auth/policy', () => ({ recoveryEnabled: auth.config.recoveryEnabled, passwordMinLength: 12 }));
  app.post('/api/v1/auth/register', { bodyLimit: 16_384 }, async (request, reply) => {
    csrf(request);
    const parsed = registrationSchema.safeParse(request.body);
    if (!parsed.success) throw new AuthFailure(400);
    await auth.register(parsed.data, request.ip, request.correlationId);
    return reply.code(201).send({ accepted: true });
  });
  app.post('/api/v1/auth/login', { bodyLimit: 4096 }, async (request, reply) => {
    csrf(request);
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) throw new AuthFailure(400);
    const grant = await auth.login(parsed.data.username, parsed.data.password, request.ip, request.correlationId);
    setRefresh(reply, grant.refreshToken, grant.expiresAt);
    return { accessToken: grant.accessToken, expiresIn: auth.config.accessTtlSeconds };
  });
  app.post('/api/v1/auth/refresh', { bodyLimit: 256 }, async (request, reply) => {
    csrf(request);
    const secret = cookies(request).get(refreshName);
    if (secret === undefined) throw new AuthFailure();
    const grant = await auth.refresh(secret, request.ip, request.correlationId);
    setRefresh(reply, grant.refreshToken, grant.expiresAt);
    return { accessToken: grant.accessToken, expiresIn: auth.config.accessTtlSeconds };
  });
  app.post('/api/v1/auth/logout', async (request, reply) => {
    csrf(request);
    await auth.logout(cookies(request).get(refreshName), request.correlationId);
    reply.header('set-cookie', `${refreshName}=; HttpOnly; Max-Age=0${suffix}`);
    return reply.code(204).send();
  });
  app.post('/api/v1/auth/password/forgot', { bodyLimit: 2048 }, async (request, reply) => {
    csrf(request);
    const parsed = recoveryStartSchema.safeParse(request.body);
    if (!parsed.success) throw new AuthFailure(400);
    const flow = await auth.recovery.forgot(parsed.data.username, request.ip, request.correlationId);
    reply.header('set-cookie', [
      `${flowName}=${flow.token}; HttpOnly; Expires=${flow.expiresAt.toUTCString()}${suffix}`,
      `${grantName}=; HttpOnly; Max-Age=0${suffix}`,
    ]);
    return { accepted: true };
  });
  app.post('/api/v1/auth/password/recover/questions', { bodyLimit: 256 }, async (request) => {
    csrf(request);
    return auth.recovery.questions(cookies(request).get(flowName), request.ip, request.correlationId);
  });
  app.post('/api/v1/auth/password/recover/verify', { bodyLimit: 16384 }, async (request, reply) => {
    csrf(request);
    const parsed = recoveryAnswersSchema.safeParse(request.body);
    if (!parsed.success) throw new AuthFailure(400);
    const grant = await auth.recovery.verify(
      cookies(request).get(flowName),
      parsed.data.answers,
      request.ip,
      request.correlationId,
    );
    reply.header(
      'set-cookie',
      `${grantName}=${grant.token}; HttpOnly; Expires=${grant.expiresAt.toUTCString()}${suffix}`,
    );
    return { accepted: true };
  });
  app.post('/api/v1/auth/password/recover/reset', { bodyLimit: 8192 }, async (request, reply) => {
    csrf(request);
    const parsed = recoveryResetSchema.safeParse(request.body);
    if (!parsed.success) throw new AuthFailure(400);
    const stored = cookies(request);
    await auth.recovery.reset(
      stored.get(flowName),
      stored.get(grantName),
      parsed.data.password,
      parsed.data.repeatPassword,
      request.ip,
      request.correlationId,
    );
    reply.header(
      'set-cookie',
      [flowName, grantName, refreshName].map((name) => `${name}=; HttpOnly; Max-Age=0${suffix}`),
    );
    return { accepted: true };
  });
  app.post('/api/v1/auth/security-questions/change', { bodyLimit: 32768 }, async (request, reply) => {
    const identity = await auth.authenticate(request.headers.authorization);
    const parsed = securityAnswersChangeSchema.safeParse(request.body);
    if (!parsed.success) throw new AuthFailure(400);
    await auth.changeSecurityAnswers(
      identity.userId,
      identity.sessionId,
      parsed.data.currentPassword,
      parsed.data.answers,
      request.ip,
      request.correlationId,
    );
    reply.header(
      'set-cookie',
      [flowName, grantName, refreshName].map((name) => `${name}=; HttpOnly; Max-Age=0${suffix}`),
    );
    return { accepted: true };
  });
  app.post('/api/v1/auth/password/change', { bodyLimit: 8192 }, async (request, reply) => {
    const identity = await auth.authenticate(request.headers.authorization);
    const parsed = passwordChangeSchema.safeParse(request.body);
    if (!parsed.success) throw new AuthFailure(400);
    await auth.changePassword(
      identity.userId,
      identity.sessionId,
      parsed.data.currentPassword,
      parsed.data.password,
      parsed.data.repeatPassword,
      request.correlationId,
    );
    reply.header('set-cookie', `${refreshName}=; HttpOnly; Max-Age=0${suffix}`);
    return { accepted: true };
  });
  app.get('/api/v1/users/me', async (request) => {
    const identity = await auth.authenticate(request.headers.authorization);
    return {
      ...identity.account,
      preferredLocale: (await auth.preferences(identity.userId)).locale,
      securityNotices: await auth.securityNotices(identity.userId),
    };
  });
  app.get('/api/v1/users/me/preferences', async (request) => {
    const identity = await auth.authenticate(request.headers.authorization);
    return auth.preferences(identity.userId);
  });
  app.put('/api/v1/users/me/preferences', { bodyLimit: 256 }, async (request) => {
    const identity = await auth.authenticate(request.headers.authorization);
    const parsed = preferencesSchema.safeParse(request.body);
    if (!parsed.success) throw new AuthFailure(400);
    return auth.savePreferences(identity.userId, identity.sessionId, parsed.data.locale);
  });
  app.get('/api/v1/auth/sessions', async (request) => {
    const identity = await auth.authenticate(request.headers.authorization);
    return (await auth.sessions.list(identity.userId)).map((session) => ({
      ...session,
      issuedAt: session.issuedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
    }));
  });
  app.delete<{ Params: { id: string } }>('/api/v1/auth/sessions/:id', async (request, reply) => {
    const identity = await auth.authenticate(request.headers.authorization);
    if (!(await auth.sessions.revoke(identity.userId, request.params.id, identity.sessionId)))
      throw new AuthFailure(404);
    return reply.code(204).send();
  });
  app.delete('/api/v1/auth/sessions', async (request, reply) => {
    const identity = await auth.authenticate(request.headers.authorization);
    await auth.revokeOthers(identity.userId, identity.sessionId, request.correlationId);
    return reply.code(204).send();
  });
}
