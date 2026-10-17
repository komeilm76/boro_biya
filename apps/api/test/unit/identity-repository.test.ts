import { describe, expect, it, vi } from 'vitest';
import type { Db } from '@boro-biya/db';
import { createIdentityRepository } from '../../src/identity/repository.js';

const id = '01902c60-0000-7000-8000-000000000001';
const row = {
  id,
  username_display: 'Alice',
  account_status: 'active',
  password_setup_required: true,
  security_setup_required: true,
};
const input = {
  username: ' Alice ',
  passwordHash: '$argon2id$test-fixture',
  passwordSetupRequired: true,
  securitySetupRequired: true,
};

function fixture() {
  const query = vi.fn<(sql: string, params?: unknown[]) => Promise<unknown>>();
  const release = vi.fn();
  const connect = vi.fn().mockResolvedValue({ query, release });
  const poolQuery = vi.fn().mockResolvedValue({ rows: [row] });
  // Typed test double at the pg boundary: only the methods the repository calls are provided.
  const db = { pool: { connect, query: poolQuery } } as unknown as Pick<Db, 'pool'>;
  return { query, release, connect, poolQuery, repository: createIdentityRepository(db) };
}

describe('identity repository transaction and projection boundary', () => {
  it('binds caller data, assigns only the default role, commits and strips credential fields', async () => {
    const f = fixture();
    f.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({});
    expect(await f.repository.create(input)).toEqual({
      id,
      username: 'Alice',
      status: 'active',
      passwordSetupRequired: true,
      securitySetupRequired: true,
    });
    expect(f.query.mock.calls[1]?.[1]).toEqual(['alice', 'Alice', 1, input.passwordHash, true, true]);
    expect(f.query.mock.calls[2]?.[1]).toEqual([id, 'user']);
    expect(f.query.mock.calls[3]?.[0]).toBe('COMMIT');
    expect(f.release).toHaveBeenCalledExactlyOnceWith();
  });

  it.each([
    { rows: [], message: 'identity insert returned no account' },
    { rows: [row], message: 'default role unavailable' },
  ])('rolls back and releases on missing insert/default role: $message', async ({ rows, message }) => {
    const f = fixture();
    f.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValue({});
    await expect(f.repository.create(input)).rejects.toThrow(message);
    expect(f.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(f.release).toHaveBeenCalledOnce();
  });

  it('rolls back and releases after a database rejection without wrapping caller data', async () => {
    const f = fixture();
    const error = new Error('database constraint');
    f.query.mockResolvedValueOnce({}).mockRejectedValueOnce(error).mockResolvedValue({});
    await expect(f.repository.create(input)).rejects.toBe(error);
    expect(f.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(f.release).toHaveBeenCalledOnce();
  });

  it('preserves the original error and destroys the client when rollback also fails', async () => {
    const f = fixture();
    const original = new Error('original constraint failure');
    f.query
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(original)
      .mockRejectedValueOnce(new Error('connection lost'));
    await expect(f.repository.create(input)).rejects.toBe(original);
    expect(f.release).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('rolls back a failed commit and releases a recovered client', async () => {
    const f = fixture();
    f.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockRejectedValueOnce(new Error('commit failed'))
      .mockResolvedValueOnce({});
    await expect(f.repository.create(input)).rejects.toThrow('commit failed');
    expect(f.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(f.release).toHaveBeenCalledExactlyOnceWith();
  });

  it('rejects invalid input before opening a transaction', async () => {
    const f = fixture();
    await expect(f.repository.create({ ...input, username: 'a' })).rejects.toThrow('invalid username');
    await expect(f.repository.create({ ...input, passwordHash: 'plaintext' })).rejects.toThrow(
      'expected encoded Argon2id hash',
    );
    expect(f.connect).not.toHaveBeenCalled();
  });

  it('propagates connection failure without trying to release an unacquired connection', async () => {
    const f = fixture();
    f.connect.mockRejectedValueOnce(new Error('connection unavailable'));
    await expect(f.repository.create(input)).rejects.toThrow('connection unavailable');
    expect(f.release).not.toHaveBeenCalled();
  });

  it('validates IDs, binds the lookup and projects only safe fields', async () => {
    const f = fixture();
    expect(await f.repository.findById("' OR true --")).toBeNull();
    expect(f.poolQuery).not.toHaveBeenCalled();
    expect(await f.repository.findById(id)).toEqual({
      id,
      username: 'Alice',
      status: 'active',
      passwordSetupRequired: true,
      securitySetupRequired: true,
    });
    expect(f.poolQuery.mock.calls[0]?.[1]).toEqual([id]);
    f.poolQuery.mockResolvedValueOnce({ rows: [] });
    expect(await f.repository.findById(id)).toBeNull();
  });
});
