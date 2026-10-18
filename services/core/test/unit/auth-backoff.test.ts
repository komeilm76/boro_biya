import { describe, expect, it, vi } from 'vitest';
import type { Db } from '@boro-biya/db';
import { createLoginBackoff, progressiveDelay } from '../../src/auth/backoff.js';

const key = (scope: string, value: string) => `${scope}:${value}`;
describe('bounded progressive login backoff', () => {
  it('starts after two account failures or five origin failures and caps exponential growth', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 300].map((n) => progressiveDelay(n, 2, 30))).toEqual([
      0, 0, 1, 2, 4, 8, 16, 30, 30,
    ]);
    expect(progressiveDelay(4, 5, 30)).toBe(0);
    expect(progressiveDelay(5, 5, 30)).toBe(1);
    expect(progressiveDelay(300, 2, 3)).toBe(3);
  });
  it('uses database elapsed time, rounds up and chooses the stricter account/origin delay', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { key_hash: key('login-failure-account', 'alice'), failures: 3, elapsed: 0.25 },
        { key_hash: key('login-failure-origin', 'origin'), failures: 10, elapsed: 1.25 },
      ],
    });
    const db = { pool: { query } } as unknown as Pick<Db, 'pool'>;
    const backoff = createLoginBackoff(db, { windowSeconds: 900, delayMaxSeconds: 30 }, key);
    expect(await backoff.check('alice', 'origin')).toBe(29);
    query.mockResolvedValueOnce({
      rows: [{ key_hash: key('login-failure-account', 'alice'), failures: 3, elapsed: 31 }],
    });
    expect(await backoff.check('alice', 'origin')).toBe(0);
    query.mockResolvedValueOnce({
      rows: [{ key_hash: key('login-failure-account', 'alice'), failures: 7, elapsed: -120 }],
    });
    expect(await backoff.check('alice', 'origin')).toBe(30);
    query.mockResolvedValueOnce({ rows: [] });
    expect(await backoff.check('alice', 'origin')).toBe(0);
    await backoff.clearAccount('alice');
    expect(query.mock.lastCall?.[1]).toEqual([key('login-failure-account', 'alice'), []]);
  });
});
