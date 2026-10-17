import { PassThrough } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { securityStreamQuerySchema } from '@boro-biya/validation';
import { AuthFailure, type AuthService } from '../auth/service.js';
/** Explicit per-process bounds; no persistent connection holds a database client. */
export function applySecurityStreamRoute(app: FastifyInstance, auth: AuthService) {
  const active = new Set<() => void>(),
    perUser = new Map<string, number>();
  app.addHook('preClose', (_done) => {
    for (const close of active) close();
    _done();
  });
  app.get('/api/v1/streams/events', async (request, reply) => {
    const parsed = securityStreamQuerySchema.safeParse(request.query);
    const last = request.headers['last-event-id'];
    if (
      !parsed.success ||
      (last !== undefined &&
        (typeof last !== 'string' || (parsed.data.after !== undefined && parsed.data.after !== last)))
    )
      throw new AuthFailure(400);
    const cursor = last ?? parsed.data.after;
    if (cursor !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(cursor))
      throw new AuthFailure(400);
    if (active.size >= 32) throw new AuthFailure(429, 60);
    const lease = await auth.streams.consume(parsed.data.ticket);
    if (active.size >= 32 || (perUser.get(lease.userId) ?? 0) >= 2) throw new AuthFailure(429, 60);
    const output = new PassThrough({ highWaterMark: 16_384 });
    let closed = false,
      timer: ReturnType<typeof setTimeout> | undefined,
      after = cursor;
    const close = () => {
      if (closed) return;
      closed = true;
      if (timer) clearTimeout(timer);
      active.delete(close);
      const count = (perUser.get(lease.userId) ?? 1) - 1;
      if (count) perUser.set(lease.userId, count);
      else perUser.delete(lease.userId);
      output.end();
    };
    active.add(close);
    perUser.set(lease.userId, (perUser.get(lease.userId) ?? 0) + 1);
    output.once('close', close);
    request.raw.socket.once('close', close);
    output.once('close', () => request.raw.socket.removeListener('close', close));
    async function poll() {
      try {
        const page = await auth.streams.read(lease, after);
        if (closed) return;
        for (const item of page.items) {
          if (!output.write(`id: ${item.id}\nevent: security-notice\ndata: ${JSON.stringify(item)}\n\n`)) {
            close();
            return;
          }
          after = item.id;
        }
        if (page.close) {
          close();
          return;
        }
        if (!output.write(': heartbeat\n\n')) {
          close();
          return;
        }
        timer = setTimeout(() => {
          void poll();
        }, 1000);
      } catch {
        close();
      }
    }
    reply.type('text/event-stream').header('cache-control', 'no-store').header('x-accel-buffering', 'no');
    output.write(': connected\n\n');
    void poll();
    return reply.send(output);
  });
}
