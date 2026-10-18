import type { Db } from '@boro-biya/db';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Operator-only read tool, not a public API or user-notification channel. It reads durable
 * alerts after a dropped LISTEN connection; the notification is only a wake-up hint. */
export async function readSecurityAlerts(db: Pick<Db, 'pool'>, before?: string) {
  if (before !== undefined && !uuid.test(before)) throw new Error('invalid alert cursor');
  const rows = await db.pool.query<{
    id: string;
    rule_key: string;
    created_at: Date;
    window_started_at: Date;
    minimum_signals: number;
    source_chain_index: string;
    source_event_hash: string;
  }>(
    'SELECT id,rule_key,created_at,window_started_at,minimum_signals,source_chain_index,source_event_hash FROM core.security_alerts WHERE ($1::uuid IS NULL OR id < $1::uuid) ORDER BY id DESC LIMIT 50',
    [before ?? null],
  );
  const items = rows.rows.map((row) => ({
    id: row.id,
    rule: row.rule_key,
    createdAt: row.created_at.toISOString(),
    windowStartedAt: row.window_started_at.toISOString(),
    minimumSignals: row.minimum_signals,
    sourceChainIndex: row.source_chain_index,
    sourceEventHash: row.source_event_hash,
  }));
  return { items, nextCursor: items.length === 50 ? items.at(-1)!.id : null };
}
