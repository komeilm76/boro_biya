import type { Db } from '@boro-biya/db';
import type { AuthConfig } from './config.js';

type QueryClient = Pick<Db['pool'], 'query'>;

/** SEC-14: reject early with Retry-After instead of retaining requests in a timer queue. */
export function progressiveDelay(failures: number, startsAt: number, cap: number): number {
  return failures < startsAt ? 0 : Math.min(cap, 2 ** Math.min(20, failures - startsAt));
}

export function createLoginBackoff(
  db: Pick<Db, 'pool'>,
  config: Pick<AuthConfig, 'windowSeconds' | 'delayMaxSeconds'>,
  key: (scope: string, value: string) => string,
) {
  const accountKey = (account: string) => key('login-failure-account', account);
  const originKey = (origin: string) => key('login-failure-origin', origin);
  return {
    async check(account: string, origin: string): Promise<number> {
      const accountHash = accountKey(account);
      const result = await db.pool.query<{ key_hash: string; failures: number; elapsed: number }>(
        `SELECT b.key_hash, count(t)::integer AS failures,
           extract(epoch FROM (clock_timestamp() - max(t)))::double precision AS elapsed
         FROM core.auth_buckets b CROSS JOIN LATERAL unnest(b.attempted_at) t
         WHERE b.key_hash = ANY($1::text[]) AND t > clock_timestamp() - $2 * interval '1 second'
         GROUP BY b.key_hash`,
        [[accountHash, originKey(origin)], config.windowSeconds],
      );
      return result.rows.reduce(
        (retry, row) =>
          Math.max(
            retry,
            Math.min(
              config.delayMaxSeconds,
              Math.ceil(
                Math.max(
                  0,
                  progressiveDelay(row.failures, row.key_hash === accountHash ? 2 : 5, config.delayMaxSeconds) -
                    row.elapsed,
                ),
              ),
            ),
          ),
        0,
      );
    },
    /** Caller holds the user lock first (if one exists). Consistent bucket ordering avoids
     * cross-account/origin deadlocks. Exactly bounded, rolling, hashed failure history. */
    async record(client: QueryClient, account: string, origin: string): Promise<number> {
      const accountHash = accountKey(account);
      let accountFailures = 0;
      for (const hash of [accountHash, originKey(origin)].sort()) {
        await client.query('INSERT INTO core.auth_buckets(key_hash) VALUES ($1) ON CONFLICT DO NOTHING', [hash]);
        await client.query('SELECT key_hash FROM core.auth_buckets WHERE key_hash = $1 FOR UPDATE', [hash]);
        const result = await client.query<{ failures: number }>(
          `UPDATE core.auth_buckets SET attempted_at = ARRAY(
             SELECT t FROM unnest(attempted_at) t WHERE t > clock_timestamp() - $2 * interval '1 second'
             ORDER BY t DESC LIMIT 299) || ARRAY[clock_timestamp()]
           WHERE key_hash = $1 RETURNING cardinality(attempted_at) AS failures`,
          [hash, config.windowSeconds],
        );
        if (hash === accountHash) accountFailures = result.rows[0]?.failures ?? 0;
      }
      return accountFailures;
    },
    async clearAccount(account: string): Promise<void> {
      // Never clear the shared origin history when just one account succeeds.
      await db.pool.query('UPDATE core.auth_buckets SET attempted_at = $2 WHERE key_hash = $1', [
        accountKey(account),
        [],
      ]);
    },
  };
}
