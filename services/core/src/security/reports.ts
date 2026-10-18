import type { Db } from '@boro-biya/db';
import { securityReportSchema } from '@boro-biya/validation';
import { identityTransaction } from '../identity/transaction.js';
type Reserve = (scope: string, value: string, limit: number, requestId: string) => Promise<void>;
/** Private operator inbox. No public reads, identity lookup, automatic account action or reply promise. */
export function createReportingService(db: Pick<Db, 'pool'>, reserve: Reserve) {
  return {
    async submit(input: unknown, origin: string, requestId: string) {
      const report = securityReportSchema.parse(input);
      await reserve('security-report-origin', origin, 5, requestId);
      await reserve('security-report-global', 'inbox', 100, requestId);
      await identityTransaction(db, async (client) => {
        const result = await client.query<{ id: string }>(
          'INSERT INTO core.security_reports(category,message,locale) VALUES ($1,$2,$3) RETURNING id',
          [report.category, report.message, report.locale],
        );
        await client.query(
          "INSERT INTO core.audit_events(actor_type,action,target_type,target_id,request_id) VALUES ('anonymous','security_report_received','security_report',$1,$2)",
          [result.rows[0]!.id, requestId],
        );
      });
    },
  };
}
/** Local operator inspection only. Treat stdout as sensitive: it includes untrusted reporter text. */
export async function readSecurityReports(db: Pick<Db, 'pool'>, before?: string) {
  if (before !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(before))
    throw new Error('invalid report cursor');
  const result = await db.pool.query<{
    id: string;
    category: string;
    message: string;
    locale: 'en' | 'fa';
    created_at: Date;
  }>(
    'SELECT id,category,message,locale,created_at FROM core.security_reports WHERE ($1::uuid IS NULL OR id < $1::uuid) ORDER BY id DESC LIMIT 50',
    [before ?? null],
  );
  const items = result.rows.map((row) => ({
    id: row.id,
    category: row.category,
    message: row.message,
    locale: row.locale,
    createdAt: row.created_at.toISOString(),
  }));
  return { items, nextCursor: items.length === 50 ? items.at(-1)!.id : null };
}
