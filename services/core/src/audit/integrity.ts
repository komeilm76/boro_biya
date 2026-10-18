import { createHash } from 'node:crypto';
import type { Db } from '@boro-biya/db';
export interface AuditCheckpoint {
  version: 1;
  index: string;
  hash: string;
}
const genesis = '0'.repeat(64);
export function parseAuditCheckpoint(value: unknown): AuditCheckpoint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid audit checkpoint');
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(',') !== 'hash,index,version' ||
    record['version'] !== 1 ||
    typeof record['index'] !== 'string' ||
    !/^(0|[1-9][0-9]{0,18})$/.test(record['index']) ||
    BigInt(record['index']) > 9223372036854775807n ||
    typeof record['hash'] !== 'string' ||
    !/^[0-9a-f]{64}$/.test(record['hash']) ||
    (record['index'] === '0' && record['hash'] !== genesis)
  )
    throw new Error('invalid audit checkpoint');
  return { version: 1, index: record['index'], hash: record['hash'] };
}
/** Read-only, bounded-page verification in one consistent snapshot. An independently retained
 * checkpoint detects truncation/rewriting of anchored history; without it a privileged actor
 * could rewrite both the entire chain and its head. This is not an external signing service.
 */
export async function verifyAuditIntegrity(db: Pick<Db, 'pool'>, anchor?: AuditCheckpoint): Promise<AuditCheckpoint> {
  const expected = anchor === undefined ? undefined : parseAuditCheckpoint(anchor);
  const client = await db.pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const head = await client.query<{ last_index: string; last_hash: string }>(
      'SELECT last_index,last_hash FROM core.audit_chain_head WHERE singleton',
    );
    if (head.rows.length !== 1) throw new Error('audit integrity mismatch');
    const checkpoint = parseAuditCheckpoint({
      version: 1,
      index: head.rows[0]!.last_index,
      hash: head.rows[0]!.last_hash,
    });
    if (expected && BigInt(expected.index) > BigInt(checkpoint.index)) throw new Error('audit integrity mismatch');
    let index = 0n,
      previous = genesis;
    while (index < BigInt(checkpoint.index)) {
      const batch = await client.query<{
        chain_index: string;
        previous_hash: string;
        event_hash: string;
        payload: string;
      }>(
        'SELECT chain_index,previous_hash,event_hash,core.audit_payload(e) AS payload FROM core.audit_events e WHERE chain_index > $1 ORDER BY chain_index LIMIT 250',
        [index.toString()],
      );
      if (!batch.rows.length) throw new Error('audit integrity mismatch');
      for (const row of batch.rows) {
        index++;
        if (
          row.chain_index !== index.toString() ||
          row.previous_hash !== previous ||
          createHash('sha256').update(row.payload, 'utf8').digest('hex') !== row.event_hash ||
          (expected?.index === row.chain_index && expected.hash !== row.event_hash)
        )
          throw new Error('audit integrity mismatch');
        previous = row.event_hash;
      }
    }
    if (index.toString() !== checkpoint.index || previous !== checkpoint.hash)
      throw new Error('audit integrity mismatch');
    // Catch records outside a tampered head, including a forged empty-chain head.
    const extra = await client.query('SELECT 1 FROM core.audit_events WHERE chain_index > $1 LIMIT 1', [
      checkpoint.index,
    ]);
    if (extra.rows.length) throw new Error('audit integrity mismatch');
    await client.query('COMMIT');
    return checkpoint;
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
