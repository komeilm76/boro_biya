import { describe, expect, it, vi } from 'vitest';
import type { Db } from '@boro-biya/db';
import { createSecurityStreams } from '../../src/streams/security.js';
const id = '01902c60-0000-7000-8000-000000000001',
  session = '01902c60-0000-7000-8000-000000000002';
const now = new Date(),
  identity = { userId: id, sessionId: session, accessExpiresAt: new Date(Date.now() + 900000) };
function fixture() {
  const state = {
    binding: true,
    found: true,
    claimed: true,
    live: true,
    terminal: false,
    present: true,
    items: [{ id, event_type: 'password_changed', created_at: now }],
  };
  const query = vi.fn(
    async (sql: string, _values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> => {
      await Promise.resolve();
      let rows: Record<string, unknown>[] = [];
      if (sql.startsWith('SELECT s.id')) return { rows: [], rowCount: state.binding ? 1 : 0 };
      if (sql.includes('RETURNING expires_at')) rows = [{ expires_at: now }];
      else if (sql.startsWith('SELECT user_id')) rows = state.found ? [{ user_id: id, session_id: session }] : [];
      else if (sql.includes('RETURNING consumed_at'))
        rows = state.claimed ? [{ opened_at: now, ends_at: new Date(now.getTime() + 60000) }] : [];
      else if (sql.startsWith('SELECT f.revoked_at'))
        rows = state.present
          ? [{ live: state.live, terminal: state.terminal, reason: 'password_changed', revoked_at: now }]
          : [];
      else if (sql.startsWith('SELECT id,event_type')) rows = state.items;
      return { rows, rowCount: rows.length };
    },
  );
  const reserve = vi.fn().mockResolvedValue(undefined),
    release = vi.fn(),
    db = { pool: { query, connect: vi.fn().mockResolvedValue({ query, release }) } } as unknown as Pick<Db, 'pool'>;
  return { state, query, reserve, release, streams: createSecurityStreams(db, reserve) };
}
describe('bounded core security stream admission and projection', () => {
  it('reserves ticket budgets, hashes the opaque ticket and commits under live binding', async () => {
    const f = fixture(),
      ticket = await f.streams.ticket(identity, 'origin', 'req');
    expect(ticket.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(ticket.expiresAt).toBe(now.toISOString());
    expect(f.reserve.mock.calls).toEqual([
      ['security-stream-origin', 'origin', 300, 'req'],
      ['security-stream-account', id, 120, 'req'],
    ]);
    const insertion = f.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO core.security_stream_tickets'));
    expect(insertion?.[1]?.[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(f.query.mock.calls)).not.toContain(ticket.ticket);
    expect(f.query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });
  it('does not issue a ticket for revoked binding or on exhausted quota', async () => {
    const f = fixture();
    f.state.binding = false;
    await expect(f.streams.ticket(identity, 'origin', 'req')).rejects.toMatchObject({ statusCode: 401 });
    expect(f.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    f.query.mockClear();
    f.reserve.mockRejectedValueOnce(new Error('quota'));
    await expect(f.streams.ticket(identity, 'origin', 'req')).rejects.toThrow('quota');
    expect(f.query).not.toHaveBeenCalled();
  });
  it('claims only known, still-live, unconsumed tickets and releases failed transactions', async () => {
    const f = fixture();
    await expect(f.streams.consume('bad')).rejects.toMatchObject({ statusCode: 401 });
    expect(f.query).not.toHaveBeenCalled();
    const lease = await f.streams.consume('A'.repeat(43));
    expect(lease).toEqual({ userId: id, sessionId: session, openedAt: now, endsAt: new Date(now.getTime() + 60000) });
    f.state.found = false;
    await expect(f.streams.consume('A'.repeat(43))).rejects.toMatchObject({ statusCode: 401 });
    f.state.found = true;
    f.state.binding = false;
    await expect(f.streams.consume('A'.repeat(43))).rejects.toMatchObject({ statusCode: 401 });
    f.state.binding = true;
    f.state.claimed = false;
    await expect(f.streams.consume('A'.repeat(43))).rejects.toMatchObject({ statusCode: 401 });
    expect(f.release).toHaveBeenCalledTimes(4);
  });
  it('returns minimal UTC owner events, validates hints and closes rejected bindings', async () => {
    const f = fixture(),
      lease = await f.streams.consume('A'.repeat(43));
    await expect(f.streams.read(lease, 'bad')).rejects.toMatchObject({ statusCode: 400 });
    expect(await f.streams.read(lease)).toEqual({
      items: [{ id, event: 'password_changed', createdAt: now.toISOString() }],
      close: false,
    });
    expect(f.query.mock.calls.find(([sql]) => sql.startsWith('SELECT id,event_type'))?.[1]?.[0]).toBe(id);
    f.state.live = false;
    expect(await f.streams.read(lease)).toEqual({ items: [], close: true });
    f.state.present = false;
    expect(await f.streams.read(lease)).toEqual({ items: [], close: true });
  });
  it('allows at most one terminal own-credential notice and then closes', async () => {
    const f = fixture(),
      lease = await f.streams.consume('A'.repeat(43));
    f.state.live = false;
    f.state.terminal = true;
    f.state.items.push({ id: session, event_type: 'password_changed', created_at: now });
    expect((await f.streams.read(lease, id)).items).toEqual([
      { id, event: 'password_changed', createdAt: now.toISOString() },
    ]);
    expect((await f.streams.read(lease)).close).toBe(true);
  });
});
