import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { Db } from '@boro-biya/db';
import { parseAuditCheckpoint, verifyAuditIntegrity } from '../../src/audit/integrity.js';
const zero = '0'.repeat(64);
function fixture() {
  const payload = '["synthetic-audit-payload"]',
    hash = createHash('sha256').update(payload).digest('hex');
  const state = {
    head: [{ last_index: '1', last_hash: hash }],
    rows: [{ chain_index: '1', previous_hash: zero, event_hash: hash, payload }],
    extra: false,
    failCommit: false,
    failRollback: false,
  };
  const query = vi.fn(async (sql: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[] }> => {
    await Promise.resolve();
    if (sql === 'COMMIT' && state.failCommit) throw new Error('commit failure');
    if (sql === 'ROLLBACK' && state.failRollback) throw new Error('rollback failure');
    if (sql.includes('FROM core.audit_chain_head')) return { rows: state.head };
    if (sql.includes('FROM core.audit_events e'))
      return { rows: state.rows.filter((row) => BigInt(row.chain_index) > BigInt(params[0] as string)) };
    if (sql.startsWith('SELECT 1')) return { rows: state.extra ? [{}] : [] };
    return { rows: [] };
  });
  const release = vi.fn();
  const db = { pool: { connect: vi.fn().mockResolvedValue({ query, release }) } } as unknown as Pick<Db, 'pool'>;
  return { db, state, query, release, checkpoint: { version: 1 as const, index: '1', hash } };
}
describe('strict audit checkpoints', () => {
  it.each([
    null,
    [],
    {},
    { version: 2, index: '1', hash: zero },
    { version: 1, index: 1, hash: zero },
    { version: 1, index: '-1', hash: zero },
    { version: 1, index: '01', hash: zero },
    { version: 1, index: '9223372036854775808', hash: zero },
    { version: 1, index: '1', hash: 'bad' },
    { version: 1, index: '0', hash: 'a'.repeat(64) },
    { version: 1, index: '1', hash: zero, extra: true },
  ])('rejects invalid checkpoint %j', (value) => {
    expect(() => parseAuditCheckpoint(value)).toThrow('invalid audit checkpoint');
  });
  it('retains bigint precision and accepts the empty-chain anchor', () => {
    expect(parseAuditCheckpoint({ version: 1, index: '9223372036854775807', hash: zero }).index).toBe(
      '9223372036854775807',
    );
    expect(parseAuditCheckpoint({ version: 1, index: '0', hash: zero }).hash).toBe(zero);
  });
});
describe('read-only audit verification', () => {
  it('uses a consistent read-only snapshot, checks the anchor and releases after commit', async () => {
    const f = fixture();
    expect(await verifyAuditIntegrity(f.db, f.checkpoint)).toEqual(f.checkpoint);
    expect(f.query.mock.calls[0]?.[0]).toBe('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    expect(f.query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
    expect(f.release).toHaveBeenCalledWith();
  });
  it('accepts genesis and an earlier independent checkpoint', async () => {
    const f = fixture();
    expect(await verifyAuditIntegrity(f.db, { version: 1, index: '0', hash: zero })).toEqual(f.checkpoint);
    f.state.head = [{ last_index: '0', last_hash: zero }];
    f.state.rows = [];
    expect(await verifyAuditIntegrity(f.db)).toEqual({ version: 1, index: '0', hash: zero });
  });
  it.each([
    'missing-head',
    'missing-row',
    'gap',
    'previous',
    'payload',
    'anchor',
    'head-hash',
    'extra',
    'future-anchor',
  ] as const)('fails closed on %s without exposing a row', async (change) => {
    const f = fixture();
    let anchor = f.checkpoint;
    if (change === 'missing-head') f.state.head = [];
    if (change === 'missing-row') f.state.rows = [];
    if (change === 'gap') f.state.rows[0]!.chain_index = '2';
    if (change === 'previous') f.state.rows[0]!.previous_hash = 'a'.repeat(64);
    if (change === 'payload') f.state.rows[0]!.payload = 'changed-private-payload';
    if (change === 'anchor') anchor = { ...anchor, hash: 'a'.repeat(64) };
    if (change === 'head-hash') f.state.head[0]!.last_hash = 'a'.repeat(64);
    if (change === 'extra') f.state.extra = true;
    if (change === 'future-anchor') anchor = { ...anchor, index: '2' };
    await expect(verifyAuditIntegrity(f.db, anchor)).rejects.toThrow('audit integrity mismatch');
    expect(f.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(f.release).toHaveBeenCalledWith();
  });
  it('does not return an unknown transaction state to the pool or mask the original failure', async () => {
    const f = fixture();
    f.state.failCommit = true;
    f.state.failRollback = true;
    await expect(verifyAuditIntegrity(f.db)).rejects.toThrow('commit failure');
    expect(f.release).toHaveBeenCalledWith(true);
  });
});
