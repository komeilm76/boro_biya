import type { Db } from '@boro-biya/db';
import type { AuthConfig } from '../auth/config.js';
import { identityTransaction } from '../identity/transaction.js';
export const CHALLENGE_CLEANUP_GRACE_SECONDS = 300;
export function challengeCleanupEnabled(config: AuthConfig) {
  return (
    config.retentionPolicy?.automatedDeletionEnabled === true &&
    config.captchaEnabled &&
    config.captchaPolicy?.cleanup === true
  );
}
/** The only implemented deletion scope. No account, session, recovery or audit erasure. */
export async function pruneExpiredChallenges(client: Pick<Db['pool'], 'query'>, config: AuthConfig) {
  if (!challengeCleanupEnabled(config)) return 0;
  const deleted = await client.query(
    "DELETE FROM core.captcha_challenges WHERE token_hash IN (SELECT token_hash FROM core.captcha_challenges WHERE expires_at < clock_timestamp() - $1 * interval '1 second' ORDER BY expires_at LIMIT 100)",
    [CHALLENGE_CLEANUP_GRACE_SECONDS],
  );
  const count = deleted.rowCount ?? 0;
  if (count)
    await client.query(
      "INSERT INTO core.audit_events(actor_type,action,target_type,request_id,details) VALUES ('system','retention_challenges_pruned','challenge','retention-pass',$1)",
      [{ count }],
    );
  return count;
}
export async function runRetentionPass(db: Pick<Db, 'pool'>, config: AuthConfig) {
  if (!challengeCleanupEnabled(config)) return { challengeCleanupEnabled: false, deletedChallenges: 0 };
  const deletedChallenges = await identityTransaction(db, (client) => pruneExpiredChallenges(client, config));
  return { challengeCleanupEnabled: true, deletedChallenges };
}
