import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { makeServerConfigFixture } from '@boro-biya/test-utils';
import { createLogger, createMetricsRegistry } from '@boro-biya/server-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyAuthRoutes } from '../../src/auth/routes.js';
import type { AuthService } from '../../src/auth/service.js';
const apps: FastifyInstance[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});
async function fixture() {
  let identity = 0;
  const read = vi.fn().mockResolvedValue({ items: [], close: false }),
    consume = vi.fn().mockImplementation(() =>
      Promise.resolve({
        userId: `user-${++identity}`,
        sessionId: 'session',
        openedAt: new Date(),
        endsAt: new Date(Date.now() + 60000),
      }),
    );
  const app = buildApp({
    config: makeServerConfigFixture(),
    registry: createMetricsRegistry(),
    logger: createLogger({ service: 'api', version: 'test', commit: 'test', level: 'error', sink: () => {} }),
  });
  apps.push(app);
  applyAuthRoutes(app, {
    config: { origin: 'https://example.test', secureCookies: true },
    streams: { read, consume },
  } as unknown as AuthService);
  const base = await app.listen({ host: '127.0.0.1', port: 0 });
  return {
    app,
    read,
    consume,
    get: (query = `ticket=${'A'.repeat(43)}`, headers?: Record<string, string>) =>
      fetch(`${base}/api/v1/streams/events?${query}`, { ...(headers ? { headers } : {}) }),
  };
}
describe('bounded SSE adapter lifecycle', () => {
  it('caps a process at 32 live connections and drains all of them before shutdown', async () => {
    const f = await fixture(),
      connections = await Promise.all(Array.from({ length: 32 }, () => f.get()));
    for (const connection of connections) expect(connection.status).toBe(200);
    const denied = await f.get();
    expect(denied.status).toBe(429);
    expect(denied.headers.get('retry-after')).toBe('60');
    expect(f.consume).toHaveBeenCalledTimes(32);
    await f.app.close();
    apps.splice(apps.indexOf(f.app), 1);
    for (const connection of connections) expect(await connection.text()).toContain(': connected');
  });
  it('validates query/Last-Event-ID before admission and passes a matching replay hint', async () => {
    const f = await fixture(),
      id = '01902c60-0000-7000-8000-000000000001';
    for (const query of ['ticket=bad', `ticket=${'A'.repeat(43)}&extra=yes`, `ticket=${'A'.repeat(43)}&after=bad`])
      expect((await f.get(query)).status).toBe(400);
    expect((await f.get(undefined, { 'last-event-id': 'bad' })).status).toBe(400);
    expect(
      (await f.get(`ticket=${'A'.repeat(43)}&after=${id}`, { 'last-event-id': '01902c60-0000-7000-8000-000000000002' }))
        .status,
    ).toBe(400);
    expect(f.consume).not.toHaveBeenCalled();
    f.read.mockResolvedValue({
      items: [{ id, event: 'password_changed', createdAt: '2026-10-17T10:00:00Z' }],
      close: true,
    });
    const response = await f.get(`ticket=${'A'.repeat(43)}&after=${id}`, { 'last-event-id': id });
    expect(await response.text()).toContain(`id: ${id}`);
    expect(f.read.mock.calls[0]?.[1]).toBe(id);
  });
  it('rejects malformed, uppercase, duplicate and conflicting hints before consuming a ticket', async () => {
    const f = await fixture();
    const id = '01902c60-0000-7000-8000-000000000001';
    const ticket = `ticket=${'A'.repeat(43)}`;
    const rejected: [string, Record<string, string>][] = [
      [`${ticket}&after=${id.toUpperCase()}`, {}],
      [ticket, { 'last-event-id': id.toUpperCase() }],
      [`${ticket}&after=${id}`, { 'last-event-id': id.toUpperCase() }],
      [`${ticket}&after=${id}&after=${id}`, {}],
      [`${ticket}&after=`, {}],
      [ticket, { 'last-event-id': '' }],
      [ticket, { 'last-event-id': `${id}, ${id}` }],
      [`${ticket}&after=${id}`, { 'last-event-id': '01902c60-0000-7000-8000-000000000002' }],
    ];
    for (const [query, headers] of rejected) expect((await f.get(query, headers)).status).toBe(400);
    expect(f.consume).not.toHaveBeenCalled();
    f.read.mockResolvedValue({ items: [], close: true });
    for (const [query, headers] of [
      [ticket, {}],
      [`${ticket}&after=${id}`, {}],
      [ticket, { 'last-event-id': id }],
      [`${ticket}&after=${id}`, { 'last-event-id': id }],
    ] as const) {
      const response = await f.get(query, headers);
      expect(response.status).toBe(200);
      await response.text();
    }
    expect(f.consume).toHaveBeenCalledTimes(4);
    expect(f.read.mock.calls.map((call: unknown[]) => call[1])).toEqual([undefined, id, id, id]);
  });
  it('closes on a failed read without leaking an exception into the stream', async () => {
    const f = await fixture();
    f.read.mockRejectedValue(new Error('private database exception'));
    const response = await f.get();
    expect(await response.text()).not.toContain('private');
  });
  it('closes slow/oversized writes without holding connection capacity', async () => {
    const f = await fixture();
    f.read.mockResolvedValue({
      items: [{ id: 'x'.repeat(18000), event: 'password_changed', createdAt: '2026-10-17T10:00:00Z' }],
      close: false,
    });
    const response = await f.get();
    expect((await response.text()).length).toBeGreaterThan(18000);
  });
});
