import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '@boro-biya/db';
import { securityStreamPolicy } from '@boro-biya/validation';
import { identityTransaction } from '../identity/transaction.js';
import { lockCurrentBinding } from '../identity/binding.js';
import { AuthFailure } from '../auth/failure.js';
type Reserve = (scope: string, value: string, limit: number, requestId: string) => Promise<void>;
export interface SecurityStreamLease {
  userId: string;
  sessionId: string;
  openedAt: Date;
  endsAt: Date;
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
/** Tickets authorize a bounded core-security stream only, never other event scopes. */
export function createSecurityStreams(db: Pick<Db, 'pool'>, reserve: Reserve) {
  return {
    async ticket(
      identity: { userId: string; sessionId: string; accessExpiresAt: Date },
      origin: string,
      requestId: string,
    ) {
      await reserve('security-stream-origin', origin, 300, requestId);
      await reserve('security-stream-account', identity.userId, 120, requestId);
      const ticket = randomBytes(32).toString('base64url');
      const expiresAt = await identityTransaction(db, async (client) => {
        if (!(await lockCurrentBinding(client, identity.userId, identity.sessionId))) throw new AuthFailure();
        const result = await client.query<{ expires_at: Date }>(
          "INSERT INTO core.security_stream_tickets(token_hash,user_id,session_id,expires_at,access_expires_at) SELECT $1,$2,$3,LEAST(clock_timestamp()+$5*interval '1 second',$4::timestamptz),$4 WHERE $4::timestamptz > clock_timestamp()+interval '1 second' RETURNING expires_at",
          [
            hash(ticket),
            identity.userId,
            identity.sessionId,
            identity.accessExpiresAt,
            securityStreamPolicy.ticketTtlSeconds,
          ],
        );
        if (!result.rows[0]) throw new AuthFailure();
        return result.rows[0].expires_at.toISOString();
      });
      return { ticket, expiresAt };
    },
    async consume(ticket: string): Promise<SecurityStreamLease> {
      if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) throw new AuthFailure();
      return identityTransaction(db, async (client) => {
        const result = await client.query<{ user_id: string; session_id: string }>(
          'SELECT user_id,session_id FROM core.security_stream_tickets WHERE token_hash=$1',
          [hash(ticket)],
        );
        const row = result.rows[0];
        if (!row || !(await lockCurrentBinding(client, row.user_id, row.session_id))) throw new AuthFailure();
        const claimed = await client.query<{ opened_at: Date; ends_at: Date }>(
          "UPDATE core.security_stream_tickets SET consumed_at=clock_timestamp() WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at > clock_timestamp() RETURNING consumed_at AS opened_at,LEAST(access_expires_at,clock_timestamp()+$2*interval '1 second') AS ends_at",
          [hash(ticket), securityStreamPolicy.maxConnectionSeconds],
        );
        if (!claimed.rows[0]) throw new AuthFailure();
        return {
          userId: row.user_id,
          sessionId: row.session_id,
          openedAt: claimed.rows[0].opened_at,
          endsAt: claimed.rows[0].ends_at,
        };
      });
    },
    async read(lease: SecurityStreamLease, after?: string) {
      if (after !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(after))
        throw new AuthFailure(400);
      return identityTransaction(db, async (client) => {
        // Same lock/order as credential changes and revocation: no cross-account replay.
        await client.query('SELECT id FROM core.users WHERE id=$1 FOR UPDATE', [lease.userId]);
        const result = await client.query<{
          live: boolean;
          terminal: boolean;
          revoked_at: Date | null;
          reason: string | null;
        }>(
          `SELECT f.revoked_at,f.revocation_reason AS reason,
          (s.consumed_at IS NULL AND f.revoked_at IS NULL) AS live,
          (s.consumed_at IS NULL AND f.revoked_at >= $3 AND f.revocation_reason IN ('password_reset','password_changed','security_answers_changed')) AS terminal
          FROM core.sessions s JOIN core.session_families f ON f.id=s.family_id JOIN core.users u ON u.id=s.user_id
          WHERE s.id=$1 AND s.user_id=$2 AND u.account_status='active' AND NOT u.password_setup_required AND NOT u.security_setup_required
          AND s.expires_at > clock_timestamp() AND f.expires_at > clock_timestamp() AND $4::timestamptz > clock_timestamp()`,
          [lease.sessionId, lease.userId, lease.openedAt, lease.endsAt],
        );
        const binding = result.rows[0];
        if (!binding || (!binding.live && !binding.terminal)) return { items: [], close: true };
        const rows = await client.query<{
          id: string;
          event_type: 'password_reset' | 'password_changed' | 'security_answers_changed';
          created_at: Date;
        }>(
          `SELECT id,event_type,created_at FROM core.notifications WHERE recipient_id=$1 AND expires_at > clock_timestamp()
          AND ($2::uuid IS NULL OR id > $2::uuid)
          AND ($3::boolean OR (event_type=$4 AND created_at >= $5))
          ORDER BY id ASC LIMIT 50`,
          [lease.userId, after ?? null, binding.live, binding.reason, binding.revoked_at],
        );
        // A pre-authorized connection gets at most one minimal notice about its own
        // credential-triggered revocation, then closes. It gains no ongoing authorization.
        const selected = binding.live ? rows.rows : rows.rows.slice(0, 1);
        return {
          items: selected.map((row) => ({
            id: row.id,
            event: row.event_type,
            createdAt: row.created_at.toISOString(),
          })),
          close: !binding.live,
        };
      });
    },
  };
}
