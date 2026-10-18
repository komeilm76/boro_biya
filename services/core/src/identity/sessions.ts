import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '@boro-biya/db';
import { lockCurrentBinding } from './binding.js';
import { identityTransaction } from './transaction.js';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export interface SessionGrant {
  userId: string;
  sessionId: string;
  familyId: string;
  /** Returned once; delivery/storage security belongs to the API cookie adapter (SEC-08). */
  refreshToken: string;
  expiresAt: Date;
}

export interface SessionSummary {
  familyId: string;
  issuedAt: Date;
  expiresAt: Date;
  lastSeenAt: Date;
}

interface FamilyRow {
  id: string;
  expires_at: Date;
}

/** Internal session persistence, NOT an authentication route or token-signing implementation.
 * Login must verify credentials/abuse policy before calling issue. All mutations lock the
 * user row first so account-state changes/revocation can use the same ordering. Database time
 * decides expiry AFTER locks are acquired. Absolute family lifetime never extends on refresh.
 * The raw 256-bit refresh secret is never stored/logged; historical hashes detect reuse.
 */
export function createSessionRepository(db: Pick<Db, 'pool'>, ttlSeconds = 30 * 86_400) {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 90 * 86_400) {
    throw new Error('session lifetime must be 1–7776000 seconds');
  }

  return {
    async issue(userId: string, expectedPasswordHash?: string): Promise<SessionGrant | null> {
      if (!UUID_V7.test(userId)) return null;
      return identityTransaction(db, async (client) => {
        const account = await client.query(
          `SELECT id FROM core.users WHERE id = $1 AND account_status = 'active'
           AND NOT password_setup_required AND NOT security_setup_required
           AND ($2::text IS NULL OR password_hash = $2) FOR UPDATE`,
          [userId, expectedPasswordHash ?? null],
        );
        if (account.rowCount !== 1) return null;
        const family = await client.query<FamilyRow>(
          `INSERT INTO core.session_families(user_id, expires_at)
           VALUES ($1, clock_timestamp() + $2 * interval '1 second') RETURNING id, expires_at`,
          [userId, ttlSeconds],
        );
        const row = family.rows[0];
        if (row === undefined) throw new Error('session family insert returned no row');
        const refreshToken = randomBytes(32).toString('base64url');
        const result = await client.query<{ id: string }>(
          `INSERT INTO core.sessions(user_id, family_id, refresh_token_hash, expires_at)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [userId, row.id, tokenHash(refreshToken), row.expires_at],
        );
        const session = result.rows[0];
        if (session === undefined) throw new Error('session insert returned no row');
        return { userId, sessionId: session.id, familyId: row.id, refreshToken, expiresAt: row.expires_at };
      });
    },

    async rotate(refreshToken: string): Promise<SessionGrant | null> {
      if (!TOKEN.test(refreshToken)) return null;
      return identityTransaction(db, async (client) => {
        const hash = tokenHash(refreshToken);
        const lookup = await client.query<{ user_id: string }>(
          'SELECT user_id FROM core.sessions WHERE refresh_token_hash = $1',
          [hash],
        );
        const user = lookup.rows[0];
        if (user === undefined) return null;
        // Separate statement after waiting for the user lock reads the latest committed state.
        await client.query('SELECT id FROM core.users WHERE id = $1 FOR UPDATE', [user.user_id]);
        const found = await client.query<{
          id: string;
          family_id: string;
          rotation_generation: number;
          consumed_at: Date | null;
          expires_at: Date;
          eligible: boolean;
        }>(
          `SELECT s.id, s.family_id, s.rotation_generation, s.consumed_at, f.expires_at,
             (f.revoked_at IS NULL AND f.expires_at > clock_timestamp() AND s.expires_at > clock_timestamp()
              AND u.account_status = 'active' AND NOT u.password_setup_required
              AND NOT u.security_setup_required) AS eligible
           FROM core.sessions s JOIN core.session_families f ON f.id = s.family_id
           JOIN core.users u ON u.id = s.user_id WHERE s.refresh_token_hash = $1`,
          [hash],
        );
        const session = found.rows[0];
        if (session === undefined) return null;
        if (session.consumed_at !== null) {
          // Commit the revocation even though the refresh fails; throwing would roll it back.
          await client.query(
            `UPDATE core.session_families SET revoked_at = clock_timestamp(), revocation_reason = 'refresh_reuse'
             WHERE id = $1 AND revoked_at IS NULL`,
            [session.family_id],
          );
          return null;
        }
        if (!session.eligible) return null;
        await client.query('UPDATE core.sessions SET consumed_at = clock_timestamp() WHERE id = $1', [session.id]);
        const nextToken = randomBytes(32).toString('base64url');
        const next = await client.query<{ id: string }>(
          `INSERT INTO core.sessions(user_id, family_id, refresh_token_hash, rotation_generation, expires_at)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [user.user_id, session.family_id, tokenHash(nextToken), session.rotation_generation + 1, session.expires_at],
        );
        const row = next.rows[0];
        if (row === undefined) throw new Error('session rotation returned no row');
        return {
          userId: user.user_id,
          sessionId: row.id,
          familyId: session.family_id,
          refreshToken: nextToken,
          expiresAt: session.expires_at,
        };
      });
    },

    /** Verify a previously authenticated access-token binding against current database state.
     * This method does NOT authenticate a bearer token. It must never accept browser IDs alone.
     */
    async isActive(userId: string, sessionId: string): Promise<boolean> {
      if (!UUID_V7.test(userId) || !UUID_V7.test(sessionId)) return false;
      const result = await db.pool.query(
        `SELECT s.id FROM core.sessions s JOIN core.session_families f ON f.id = s.family_id
         JOIN core.users u ON u.id = s.user_id
         WHERE s.id = $1 AND s.user_id = $2 AND s.consumed_at IS NULL
           AND f.revoked_at IS NULL AND f.expires_at > clock_timestamp() AND s.expires_at > clock_timestamp()
           AND u.account_status = 'active' AND NOT u.password_setup_required AND NOT u.security_setup_required`,
        [sessionId, userId],
      );
      return result.rowCount === 1;
    },

    async list(userId: string): Promise<SessionSummary[]> {
      if (!UUID_V7.test(userId)) return [];
      const result = await db.pool.query<{
        family_id: string;
        issued_at: Date;
        expires_at: Date;
        last_seen_at: Date;
      }>(
        `SELECT f.id AS family_id, f.issued_at, f.expires_at, s.last_seen_at
         FROM core.session_families f JOIN core.sessions s ON s.family_id = f.id
         WHERE f.user_id = $1 AND f.revoked_at IS NULL AND f.expires_at > clock_timestamp() AND s.expires_at > clock_timestamp()
           AND s.consumed_at IS NULL AND s.expires_at > clock_timestamp() ORDER BY f.issued_at, f.id`,
        [userId],
      );
      return result.rows.map((row) => ({
        familyId: row.family_id,
        issuedAt: row.issued_at,
        expiresAt: row.expires_at,
        lastSeenAt: row.last_seen_at,
      }));
    },

    /** Ownership is part of the update, not an unchecked caller-supplied family ID. */
    async revoke(
      userId: string,
      familyId: string,
      currentSessionId?: string,
      requestId = 'session-revoke',
    ): Promise<boolean> {
      if (
        !UUID_V7.test(userId) ||
        !UUID_V7.test(familyId) ||
        (currentSessionId !== undefined && !UUID_V7.test(currentSessionId))
      )
        return false;
      return identityTransaction(db, async (client) => {
        if (currentSessionId !== undefined) {
          if (!(await lockCurrentBinding(client, userId, currentSessionId))) return false;
        } else await client.query('SELECT id FROM core.users WHERE id = $1 FOR UPDATE', [userId]);
        const result = await client.query(
          `UPDATE core.session_families SET revoked_at = clock_timestamp(), revocation_reason = 'owner_revoked'
           WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id`,
          [familyId, userId],
        );
        if (result.rowCount !== 1) return false;
        await client.query(
          `INSERT INTO core.audit_events(actor_id,actor_type,action,target_type,target_id,request_id)
           VALUES ($1,'user','session_revoked','session_family',$2,$3)`,
          [userId, familyId, requestId],
        );
        return true;
      });
    },

    /** Standalone revoke-all. Credential/state lifecycle wiring must revoke families inside
     * its own mutation transaction rather than composing this as a second transaction.
     */
    async revokeAll(userId: string): Promise<void> {
      if (!UUID_V7.test(userId)) return;
      await identityTransaction(db, async (client) => {
        await client.query('SELECT id FROM core.users WHERE id = $1 FOR UPDATE', [userId]);
        await client.query(
          `UPDATE core.session_families SET revoked_at = clock_timestamp(), revocation_reason = 'all_sessions_revoked'
           WHERE user_id = $1 AND revoked_at IS NULL`,
          [userId],
        );
      });
    },
  };
}
