import { describe, expect, it, vi } from 'vitest';
import type { Db } from '@boro-biya/db';
import { createSessionRepository } from '../../src/identity/sessions.js';

const userId = '01902c60-0000-7000-8000-000000000001';
const familyId = '01902c60-0000-7000-8000-000000000002';
const sessionId = '01902c60-0000-7000-8000-000000000003';
const expires = new Date('2030-01-01T00:00:00Z');
const token = 'A'.repeat(43);
const current = {
  id: sessionId,
  family_id: familyId,
  rotation_generation: 0,
  consumed_at: null,
  expires_at: expires,
  eligible: true,
};

function fixture(results: unknown[] = []) {
  const query = vi.fn<(sql: string, params?: unknown[]) => Promise<unknown>>();
  query.mockResolvedValue({ rows: [], rowCount: 0 });
  for (const result of results) query.mockResolvedValueOnce(result);
  const release = vi.fn();
  const connect = vi.fn().mockResolvedValue({ query, release });
  const poolQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  const db = { pool: { connect, query: poolQuery } } as unknown as Pick<Db, 'pool'>;
  return { query, release, connect, poolQuery, db, sessions: createSessionRepository(db) };
}
const begin = {};
const owner = { rows: [{ user_id: userId }] };
const eligible = { rowCount: 1 };

describe('session boundary and failure paths (SEC-08, SEC-10)', () => {
  it.each([0, -1, 1.5, NaN, Infinity, 90 * 86_400 + 1])('rejects unsafe lifetime %s', (ttl) => {
    expect(() => createSessionRepository(fixture().db, ttl)).toThrow('session lifetime');
  });

  it('rejects malformed values before using the pool', async () => {
    const f = fixture();
    expect(await f.sessions.issue('invalid')).toBeNull();
    expect(await f.sessions.rotate('invalid')).toBeNull();
    expect(await f.sessions.isActive(userId, 'invalid')).toBe(false);
    expect(await f.sessions.isActive('invalid', sessionId)).toBe(false);
    expect(await f.sessions.list('invalid')).toEqual([]);
    expect(await f.sessions.revoke('invalid', familyId)).toBe(false);
    expect(await f.sessions.revoke(userId, 'invalid')).toBe(false);
    await f.sessions.revokeAll('invalid');
    expect(f.connect).not.toHaveBeenCalled();
    expect(f.poolQuery).not.toHaveBeenCalled();
  });

  it('issues a unique secret but sends only its hash to SQL', async () => {
    const f = fixture([
      begin,
      eligible,
      { rows: [{ id: familyId, expires_at: expires }] },
      { rows: [{ id: sessionId }] },
      {},
    ]);
    const grant = await f.sessions.issue(userId);
    expect(grant?.familyId).toBe(familyId);
    expect(grant?.sessionId).toBe(sessionId);
    expect(grant?.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(f.query.mock.calls)).not.toContain(grant?.refreshToken);
    expect(f.query.mock.calls[3]?.[1]?.[2]).toMatch(/^[a-f0-9]{64}$/);
    expect(f.query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });

  it('denies ineligible accounts', async () => {
    const f = fixture([begin, { rowCount: 0 }]);
    expect(await f.sessions.issue(userId)).toBeNull();
  });

  it.each([
    { results: [begin, eligible, { rows: [] }], error: 'session family insert returned no row' },
    {
      results: [begin, eligible, { rows: [{ id: familyId, expires_at: expires }] }, { rows: [] }],
      error: 'session insert returned no row',
    },
  ])('rolls back issue failure: $error', async ({ results, error }) => {
    const f = fixture(results);
    await expect(f.sessions.issue(userId)).rejects.toThrow(error);
    expect(f.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(f.release).toHaveBeenCalledOnce();
  });

  it('rotates after locking the account and binds generation plus original expiry', async () => {
    const f = fixture([begin, owner, {}, { rows: [current] }, {}, { rows: [{ id: sessionId }] }, {}]);
    const next = await f.sessions.rotate(token);
    expect(next?.familyId).toBe(familyId);
    expect(next?.expiresAt).toEqual(expires);
    expect(f.query.mock.calls[2]?.[0]).toContain('FOR UPDATE');
    expect(f.query.mock.calls[5]?.[1]?.[3]).toBe(1);
    expect(f.query.mock.calls[5]?.[1]?.[4]).toEqual(expires);
    expect(JSON.stringify(f.query.mock.calls)).not.toContain(token);
  });

  it.each([
    [begin, { rows: [] }],
    [begin, owner, {}, { rows: [] }],
    [begin, owner, {}, { rows: [{ ...current, eligible: false }] }],
  ])('denies missing or ineligible records', async (...results) => {
    expect(await fixture(results).sessions.rotate(token)).toBeNull();
  });

  it('commits rather than rolls back replay revocation', async () => {
    const f = fixture([begin, owner, {}, { rows: [{ ...current, consumed_at: new Date() }] }, {}]);
    expect(await f.sessions.rotate(token)).toBeNull();
    expect(f.query.mock.calls.at(-2)?.[0]).toContain("revocation_reason = 'refresh_reuse'");
    expect(f.query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });

  it('rolls back both consumption and insertion on failed successor creation', async () => {
    const f = fixture([begin, owner, {}, { rows: [current] }, {}, { rows: [] }]);
    await expect(f.sessions.rotate(token)).rejects.toThrow('session rotation returned no row');
    expect(f.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
  });

  it('projects only safe listing fields, and checks both user and session binding', async () => {
    const f = fixture();
    expect(await f.sessions.isActive(userId, sessionId)).toBe(false);
    f.poolQuery.mockResolvedValueOnce({ rowCount: 1 });
    expect(await f.sessions.isActive(userId, sessionId)).toBe(true);
    expect(f.poolQuery.mock.calls[1]?.[1]).toEqual([sessionId, userId]);
    f.poolQuery.mockResolvedValueOnce({
      rows: [{ family_id: familyId, issued_at: expires, expires_at: expires, last_seen_at: expires }],
    });
    expect(await f.sessions.list(userId)).toEqual([
      { familyId, issuedAt: expires, expiresAt: expires, lastSeenAt: expires },
    ]);
  });

  it('binds owner identity on revoke and locks before revoking all', async () => {
    const f = fixture([begin, {}, { rowCount: 1 }]);
    expect(await f.sessions.revoke(userId, familyId)).toBe(true);
    expect(f.query.mock.calls[2]?.[1]).toEqual([familyId, userId]);
    expect(await f.sessions.revoke(userId, familyId)).toBe(false);
    await f.sessions.revokeAll(userId);
    expect(f.query.mock.calls.at(-2)?.[1]).toEqual([userId]);
  });
});
