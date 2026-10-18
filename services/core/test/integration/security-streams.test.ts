import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createDb, initCluster, type Db } from '@boro-biya/db';
import { createDatabaseFor, injectedPgAdminUrl, type TestDatabaseHandle } from '@boro-biya/test-utils/pg';
import { makeCapturedLog, makeServerConfigFixture } from '@boro-biya/test-utils';
import { createLogger, createMetricsRegistry } from '@boro-biya/server-runtime';
import { securityNoticeEventSchema, securityStreamTicketSchema } from '@boro-biya/validation';
import { buildApp } from '../../src/app.js';
import { createAuthService, type AuthService } from '../../src/auth/service.js';
import { readAuthConfig } from '../../src/auth/config.js';
const config = readAuthConfig({
  SESSION_SECRET: 'disposable-security-stream-material',
  WEB_ORIGIN: 'https://example.test',
});
let database: TestDatabaseHandle,
  db: Db,
  root: Db,
  auth: AuthService,
  app: FastifyInstance,
  base = '',
  headers: Record<string, string>,
  index = 0;
let first: Awaited<ReturnType<AuthService['login']>>,
  second: Awaited<ReturnType<AuthService['login']>>,
  username = '';
const capture = makeCapturedLog(),
  password = 'Synthetic!orchard782',
  controllers: AbortController[] = [];
beforeAll(async () => {
  database = await createDatabaseFor(injectedPgAdminUrl(), 'security_streams');
  await initCluster({
    adminConnectionString: database.adminConnectionString,
    passwords: { core: 'stream-only', relation: 'stream-only', sos: 'stream-only' },
    repoRoot: resolve('.'),
  });
  root = createDb({ connectionString: database.adminConnectionString });
  const url = new URL(database.adminConnectionString);
  url.username = 'boro_core';
  url.password = 'stream-only';
  db = createDb({ connectionString: url.toString() });
  auth = await createAuthService(db, config);
  app = buildApp({
    config: makeServerConfigFixture(),
    registry: createMetricsRegistry(),
    logger: createLogger({ service: 'api', version: 'test', commit: 'test', level: 'debug', sink: capture.sink }),
    auth,
  });
  base = await app.listen({ host: '127.0.0.1', port: 0 });
  const csrf = (await app.inject('/api/v1/auth/csrf')).json<{ csrfToken: string }>().csrfToken;
  headers = { origin: config.origin, cookie: `boro_csrf=${csrf}`, 'x-csrf-token': csrf };
});
beforeEach(async () => {
  for (const controller of controllers.splice(0)) controller.abort();
  await root.query('TRUNCATE core.auth_buckets');
  username = `stream_first_${++index}`;
  for (const name of [username, `stream_second_${index}`])
    await auth.register(
      {
        username: name,
        password,
        repeatPassword: password,
        answers: [1, 2, 3, 4, 5].map((questionId) => ({ questionId, answer: 'synthetic answer' })),
      },
      'fixture',
      'fixture',
    );
  first = await auth.login(username, password, 'fixture', 'fixture');
  second = await auth.login(`stream_second_${index}`, password, 'fixture', 'fixture');
});
afterAll(async () => {
  for (const controller of controllers) controller.abort();
  await app?.close();
  await db?.close();
  await root?.close();
  await database?.drop();
});
async function ticket(grant = first) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/streams/ticket',
    headers: { ...headers, authorization: `Bearer ${grant.accessToken}` },
  });
  expect(response.statusCode).toBe(200);
  return securityStreamTicketSchema.parse(response.json());
}
async function lease(grant = first) {
  return auth.streams.consume((await ticket(grant)).ticket);
}
async function notice(userId = first.userId, event = 'password_changed') {
  return (
    await root.pool.query<{ id: string }>(
      'INSERT INTO core.notifications(recipient_id,event_type) VALUES ($1,$2) RETURNING id',
      [userId, event],
    )
  ).rows[0]!.id;
}
async function open(raw?: string, after?: string) {
  const controller = new AbortController();
  controllers.push(controller);
  const query = new URLSearchParams({ ticket: raw ?? (await ticket()).ticket, ...(after ? { after } : {}) });
  const response = await fetch(`${base}/api/v1/streams/events?${query.toString()}`, { signal: controller.signal });
  return { response, controller, reader: response.body!.getReader() };
}
async function textUntil(reader: ReadableStreamDefaultReader<Uint8Array>, match: (text: string) => boolean) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reading = (async () => {
    let text = '';
    while (true) {
      const part = await reader.read();
      if (part.done) return text;
      text += new TextDecoder().decode(part.value);
      if (match(text)) return text;
    }
  })();
  try {
    return await Promise.race([
      reading,
      new Promise<never>((_yes, no) => {
        timer = setTimeout(() => no(new Error('stream deadline')), 5000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
describe('native single-use security streams', () => {
  it('requires bearer/origin/CSRF and a strict empty ticket body', async () => {
    for (const patch of [{ authorization: '' }, { origin: 'https://evil.test' }, { cookie: '' }])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/streams/ticket',
            headers: { ...headers, authorization: `Bearer ${first.accessToken}`, ...patch },
          })
        ).statusCode,
      ).toBe(patch.authorization !== undefined ? 401 : 403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/streams/ticket',
          headers: { ...headers, authorization: `Bearer ${first.accessToken}` },
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
  });
  it('stores only hashed tickets and consumes them once across service restart/concurrency', async () => {
    const issued = await ticket();
    const row = await root.pool.query<{ token_hash: string; expires_at: Date }>(
      'SELECT token_hash,expires_at FROM core.security_stream_tickets WHERE token_hash=$1',
      [createHash('sha256').update(issued.ticket).digest('hex')],
    );
    expect(row.rows[0]?.token_hash).not.toBe(issued.ticket);
    expect(Date.parse(issued.expiresAt) - Date.now()).toBeLessThanOrEqual(15000);
    const restarted = await createAuthService(db, config);
    const claims = await Promise.allSettled([
      auth.streams.consume(issued.ticket),
      restarted.streams.consume(issued.ticket),
    ]);
    expect(claims.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(capture.raw.join('')).not.toContain(issued.ticket);
  });
  it('denies expired, replayed, unknown tickets and tickets whose current binding was revoked', async () => {
    const expired = await ticket();
    await root.query(
      "UPDATE core.security_stream_tickets SET issued_at=clock_timestamp()-interval '20 seconds',expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1",
      [createHash('sha256').update(expired.ticket).digest('hex')],
    );
    await expect(auth.streams.consume(expired.ticket)).rejects.toMatchObject({ statusCode: 401 });
    await expect(auth.streams.consume('A'.repeat(43))).rejects.toMatchObject({ statusCode: 401 });
    const revoked = await ticket();
    await auth.sessions.revoke(first.userId, first.familyId, first.sessionId, 'fixture');
    await expect(auth.streams.consume(revoked.ticket)).rejects.toMatchObject({ statusCode: 401 });
  });
  it('replays ordered bounded owner-only notices and treats foreign cursors as hints, never identity', async () => {
    const current = await lease();
    const a = await notice(),
      foreign = await notice(second.userId),
      b = await notice();
    const page = await auth.streams.read(current);
    expect(page.items.map((item) => item.id)).toEqual([a, b]);
    expect(page.items.map((item) => item.id)).not.toContain(foreign);
    for (const item of page.items) expect(securityNoticeEventSchema.parse(item)).toEqual(item);
    expect((await auth.streams.read(current, a)).items.map((item) => item.id)).toEqual([b]);
    expect((await auth.streams.read(current, foreign)).items.map((item) => item.id)).toEqual([b]);
    await root.query(
      "INSERT INTO core.notifications(recipient_id,event_type) SELECT $1,'password_changed' FROM generate_series(1,55)",
      [first.userId],
    );
    expect((await auth.streams.read(current, b)).items).toHaveLength(50);
  });
  it('serves actual SSE with IDs and no-store, then replays only missed notices with a fresh ticket', async () => {
    const issued = await ticket();
    const stream = await open(issued.ticket);
    expect(stream.response.status).toBe(200);
    expect(stream.response.headers.get('content-type')).toContain('text/event-stream');
    expect(stream.response.headers.get('cache-control')).toBe('no-store');
    const a = await notice();
    const text = await textUntil(stream.reader, (value) => value.includes(`id: ${a}`));
    expect(text).toContain('event: security-notice');
    expect(text).not.toContain(first.userId);
    stream.controller.abort();
    const b = await notice();
    const resumed = await open(undefined, a);
    const replay = await textUntil(resumed.reader, (value) => value.includes(`id: ${b}`));
    expect(replay).not.toContain(`id: ${a}`);
    resumed.controller.abort();
    expect(capture.raw.join('')).not.toContain(issued.ticket);
  });
  it('delivers a minimal reset notice to an already-open remaining session and closes after actual recovery', async () => {
    const stream = await open();
    await textUntil(stream.reader, (value) => value.includes('connected'));
    const flow = await auth.recovery.forgot(username, 'reset', 'reset');
    const questions = await auth.recovery.questions(flow.token, 'reset', 'reset');
    const grant = await auth.recovery.verify(
      flow.token,
      questions.map((question) => ({ questionId: question.id, answer: 'synthetic answer' })),
      'reset',
      'reset',
    );
    const next = 'Another!violet782';
    await auth.recovery.reset(flow.token, grant.token, next, next, 'reset', 'reset');
    const text = await textUntil(stream.reader, () => false);
    expect(text).toContain('password_reset');
    expect(text).not.toContain(flow.token);
    expect(text).not.toContain(grant.token);
    expect(text).not.toContain(next);
    await expect(auth.authenticate(`Bearer ${first.accessToken}`)).rejects.toMatchObject({ statusCode: 401 });
    const other = await lease(second);
    expect((await auth.streams.read(other)).items).toEqual([]);
  });
  it.each(['password_changed', 'security_answers_changed'] as const)(
    'delivers only its own terminal %s notice, never later data',
    async (event) => {
      const current = await lease();
      if (event === 'password_changed')
        await auth.changePassword(
          first.userId,
          first.sessionId,
          password,
          'Another!violet782',
          'Another!violet782',
          'change',
        );
      else
        await auth.changeSecurityAnswers(
          first.userId,
          first.sessionId,
          password,
          [1, 2, 3, 4, 5].map((questionId) => ({ questionId, answer: 'replacement synthetic answer' })),
          'answers',
          'answers',
        );
      await notice(first.userId, 'password_reset');
      const page = await auth.streams.read(current);
      expect(page.close).toBe(true);
      expect(page.items.map((item) => item.event)).toEqual([event]);
      expect((await auth.streams.read(current, page.items[0]!.id)).items).toEqual([]);
    },
  );
  it.each([
    'locked',
    'banned',
    'deactivated',
    'password',
    'security',
    'both',
    'revoked',
    'expired',
    'rotated',
  ] as const)('closes %s binding without replaying private data', async (state) => {
    const current = await lease();
    await notice();
    if (state === 'revoked') await auth.sessions.revoke(first.userId, first.familyId, first.sessionId, 'fixture');
    else if (state === 'rotated') await auth.sessions.rotate(first.refreshToken);
    else if (state === 'expired')
      await root.query(
        "UPDATE core.sessions SET issued_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
        [first.sessionId],
      );
    else
      await root.query(
        "UPDATE core.users SET account_status=$2,state_reason='fixture',locked_until=CASE WHEN $2='locked' THEN clock_timestamp()+interval '1 hour' ELSE NULL END,password_setup_required=$3,security_setup_required=$4 WHERE id=$1",
        [
          first.userId,
          ['password', 'security', 'both'].includes(state) ? 'active' : state,
          state === 'password' || state === 'both',
          state === 'security' || state === 'both',
        ],
      );
    expect(await auth.streams.read(current)).toEqual({ items: [], close: true });
  });
  it('bounds admission and stream lifetime by access expiry and persists ticket quotas across restart', async () => {
    const identity = await auth.authenticate(`Bearer ${first.accessToken}`),
      deadline = new Date(Date.now() + 5000);
    const issued = await auth.streams.ticket({ ...identity, accessExpiresAt: deadline }, 'short', 'short');
    expect(Date.parse(issued.expiresAt)).toBeLessThanOrEqual(deadline.getTime());
    expect((await auth.streams.consume(issued.ticket)).endsAt.getTime()).toBeLessThanOrEqual(deadline.getTime());
    await expect(
      auth.streams.ticket({ ...identity, accessExpiresAt: new Date(0) }, 'expired', 'expired'),
    ).rejects.toMatchObject({ statusCode: 401 });
    await root.query('UPDATE core.auth_buckets SET attempted_at=array_fill(clock_timestamp(),ARRAY[300])');
    const restarted = await createAuthService(db, config);
    await expect(restarted.streams.ticket(identity, 'new-origin', 'quota')).rejects.toMatchObject({ statusCode: 429 });
  });
  it('honours lease expiry, strict stream query/cursor validation, per-user connection bounds and shutdown', async () => {
    const current = await lease();
    expect(await auth.streams.read({ ...current, endsAt: new Date(0) })).toEqual({ items: [], close: true });
    for (const query of [
      'ticket=bad',
      `ticket=${'A'.repeat(43)}&unexpected=true`,
      `ticket=${'A'.repeat(43)}&after=bad`,
    ])
      expect((await app.inject(`/api/v1/streams/events?${query.toString()}`)).statusCode).toBe(400);
    const a = await open(),
      b = await open();
    const denied = await open();
    expect(denied.response.status).toBe(429);
    expect(denied.response.headers.get('retry-after')).toBe('60');
    a.controller.abort();
    b.controller.abort();
    denied.controller.abort();
  });
});
