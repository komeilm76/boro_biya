import type { Db } from '@boro-biya/db';

/** Mutations recheck authorization AFTER acquiring the same user lock as rotation/revocation.
 * An earlier HTTP bearer check alone cannot authorize a mutation after logout wins the race. */
export async function lockCurrentBinding(
  client: Pick<Db['pool'], 'query'>,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  await client.query('SELECT id FROM core.users WHERE id = $1 FOR UPDATE', [userId]);
  const result = await client.query(
    `SELECT s.id FROM core.sessions s JOIN core.session_families f ON f.id = s.family_id
     JOIN core.users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.user_id = $2 AND s.consumed_at IS NULL
       AND f.revoked_at IS NULL AND f.expires_at > clock_timestamp() AND s.expires_at > clock_timestamp()
       AND u.account_status = 'active' AND NOT u.password_setup_required AND NOT u.security_setup_required`,
    [sessionId, userId],
  );
  return result.rowCount === 1;
}
