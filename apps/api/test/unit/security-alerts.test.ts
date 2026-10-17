import { describe, expect, it, vi } from 'vitest';
import type { Db } from '@boro-biya/db';
import { readSecurityAlerts } from '../../src/audit/alerts.js';
const id = '01902c60-0000-7000-8000-000000000001';
function fixture(count: number) {
  const query = vi.fn().mockResolvedValue({
    rows: Array.from({ length: count }, () => ({
      id,
      rule_key: 'rate_limit_saturation',
      created_at: new Date('2026-10-17T12:00:00Z'),
      window_started_at: new Date('2026-10-17T11:55:00Z'),
      minimum_signals: 5,
      source_chain_index: '9007199254740993',
      source_event_hash: 'a'.repeat(64),
    })),
  });
  return { db: { pool: { query } } as unknown as Pick<Db, 'pool'>, query };
}
describe('operator security alert projection', () => {
  it.each(['bad', "' OR true --", '', id + 'extra'])('rejects cursor %j before database access', async (cursor) => {
    const f = fixture(0);
    await expect(readSecurityAlerts(f.db, cursor)).rejects.toThrow('invalid alert cursor');
    expect(f.query).not.toHaveBeenCalled();
  });
  it('returns an empty bounded result with no next cursor', async () => {
    const f = fixture(0);
    expect(await readSecurityAlerts(f.db)).toEqual({ items: [], nextCursor: null });
    expect(f.query.mock.calls[0]?.[1]).toEqual([null]);
  });
  it('uses UTC instants and string chain indexes without lossy numeric conversion', async () => {
    const f = fixture(1);
    expect(await readSecurityAlerts(f.db, id)).toEqual({
      items: [
        {
          id,
          rule: 'rate_limit_saturation',
          createdAt: '2026-10-17T12:00:00.000Z',
          windowStartedAt: '2026-10-17T11:55:00.000Z',
          minimumSignals: 5,
          sourceChainIndex: '9007199254740993',
          sourceEventHash: 'a'.repeat(64),
        },
      ],
      nextCursor: null,
    });
    expect(f.query.mock.calls[0]?.[1]).toEqual([id]);
  });
  it('returns a cursor only at the 50-item boundary', async () => {
    const f = fixture(50);
    expect((await readSecurityAlerts(f.db)).nextCursor).toBe(id);
  });
});
