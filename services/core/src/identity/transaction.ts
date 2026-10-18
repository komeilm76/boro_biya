import type { Db } from '@boro-biya/db';

type QueryClient = Pick<Db['pool'], 'query'>;

/** App-owned atomic identity operations. A failed rollback must not replace the original
 * failure or return a client with unknown transaction state to the pool (SEC-42, DATA-10).
 */
export async function identityTransaction<T>(
  db: Pick<Db, 'pool'>,
  operation: (client: QueryClient) => Promise<T>,
): Promise<T> {
  const client = await db.pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      discard = true;
    }
    throw error;
  } finally {
    if (discard) client.release(true);
    else client.release();
  }
}
