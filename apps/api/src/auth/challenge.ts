import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { Db } from '@boro-biya/db';
import { identityTransaction } from '../identity/transaction.js';
import { AuthFailure } from './failure.js';
import type { AuthConfig } from './config.js';
import type { ChallengePurpose } from '@boro-biya/validation';
type Reserve = (scope: string, value: string, limit: number, requestId: string) => Promise<void>;
const opaque = /^[A-Za-z0-9_-]{43}$/;
/** This deliberately claims computational work, not human identity or bot elimination. */
export function validChallengeWork(token: string, counter: number, bits: number): boolean {
  if (
    !opaque.test(token) ||
    !Number.isSafeInteger(counter) ||
    counter < 0 ||
    counter > 0xffffffff ||
    !Number.isInteger(bits) ||
    bits < 12 ||
    bits > 20
  )
    return false;
  const digest = createHash('sha256').update(`${token}:${counter}`).digest();
  for (let i = 0; i < bits; i++) if ((digest[Math.floor(i / 8)]! & (1 << (7 - (i % 8)))) !== 0) return false;
  return true;
}
export function createChallengeService(db: Pick<Db, 'pool'>, config: AuthConfig, reserve: Reserve) {
  function configured() {
    if (config.captchaEnabled && !config.captchaPolicy) throw new AuthFailure(503);
  }
  function policy() {
    configured();
    if (!config.captchaEnabled || !config.captchaPolicy) throw new AuthFailure(503);
    return config.captchaPolicy;
  }
  const keyed = (scope: string, value: string) =>
    createHmac('sha256', policy().secret).update(`${scope}:${value}`).digest('hex');
  const riskKey = (purpose: ChallengePurpose, origin: string) => keyed(`risk-${purpose}`, origin);
  async function audit(client: Pick<Db['pool'], 'query'>, action: string, requestId: string) {
    await client.query(
      "INSERT INTO core.audit_events(actor_type,action,target_type,request_id) VALUES ('anonymous',$1,'challenge',$2)",
      [action, requestId],
    );
  }
  async function risk(purpose: ChallengePurpose, origin: string) {
    const result = await db.pool.query<{ count: number }>(
      "SELECT count(t)::integer AS count FROM core.auth_buckets b CROSS JOIN LATERAL unnest(b.attempted_at) t WHERE key_hash = $1 AND t > clock_timestamp() - $2 * interval '1 second'",
      [riskKey(purpose, origin), config.windowSeconds],
    );
    return result.rows[0]?.count ?? 0;
  }
  return {
    configured,
    async issue(purpose: ChallengePurpose, origin: string, requestId: string) {
      configured();
      if (!config.captchaEnabled) return { required: false as const };
      const p = policy();
      await reserve('captcha-issue-origin', origin, config.maxOriginAttempts, requestId);
      const count = await risk(purpose, origin);
      if (count < p.threshold) return { required: false as const };
      const bits = Math.min(20, p.bits + (p.adaptive ? Math.floor(count / p.threshold) - 1 : 0));
      const token = randomBytes(32).toString('base64url');
      const expiresAt = await identityTransaction(db, async (client) => {
        if (p.cleanup)
          await client.query(
            "DELETE FROM core.captcha_challenges WHERE token_hash IN (SELECT token_hash FROM core.captcha_challenges WHERE expires_at < clock_timestamp() - interval '5 minutes' ORDER BY expires_at LIMIT 100)",
          );
        const row = await client.query<{ expires_at: Date }>(
          "INSERT INTO core.captcha_challenges(token_hash,origin_hash,purpose,work_bits,expires_at) VALUES ($1,$2,$3,$4,clock_timestamp() + $5 * interval '1 second') RETURNING expires_at",
          [keyed('token', token), keyed('origin', origin), purpose, bits, p.ttlSeconds],
        );
        await audit(client, 'challenge_issued', requestId);
        return row.rows[0]!.expires_at.toISOString();
      });
      return { required: true as const, token, bits, expiresAt };
    },
    async verify(token: string, counter: number, purpose: ChallengePurpose, origin: string, requestId: string) {
      const p = policy();
      await reserve('captcha-verify-origin', origin, config.maxOriginAttempts, requestId);
      if (!opaque.test(token)) throw new AuthFailure(403);
      const grant = randomBytes(32).toString('base64url');
      const result = await identityTransaction(db, async (client) => {
        await client.query('SELECT token_hash FROM core.captcha_challenges WHERE token_hash = $1 FOR UPDATE', [
          keyed('token', token),
        ]);
        const found = await client.query<{
          work_bits: number;
          attempts: number;
          live: boolean;
          purpose: string;
          origin_hash: string;
        }>(
          'SELECT work_bits,attempts,purpose,origin_hash,solved_at IS NULL AND expires_at > clock_timestamp() AS live FROM core.captcha_challenges WHERE token_hash = $1',
          [keyed('token', token)],
        );
        const row = found.rows[0];
        if (
          !row?.live ||
          row.purpose !== purpose ||
          row.origin_hash !== keyed('origin', origin) ||
          row.attempts >= p.maxAttempts
        )
          return { error: true as const };
        await client.query('UPDATE core.captcha_challenges SET attempts = attempts + 1 WHERE token_hash = $1', [
          keyed('token', token),
        ]);
        if (!validChallengeWork(token, counter, row.work_bits)) {
          await audit(client, 'challenge_rejected', requestId);
          return { error: true as const };
        }
        const updated = await client.query<{ grant_expires_at: Date }>(
          "UPDATE core.captcha_challenges SET solved_at = clock_timestamp(),grant_hash = $2,grant_expires_at = LEAST(expires_at,clock_timestamp() + interval '60 seconds') WHERE token_hash = $1 AND expires_at > clock_timestamp() RETURNING grant_expires_at",
          [keyed('token', token), keyed('grant', grant)],
        );
        const issued = updated.rows[0];
        if (!issued) {
          await audit(client, 'challenge_rejected', requestId);
          return { error: true as const };
        }
        await audit(client, 'challenge_verified', requestId);
        return { grant, expiresAt: issued.grant_expires_at.toISOString() };
      });
      if ('error' in result) throw new AuthFailure(403);
      return result;
    },
    async admit(purpose: ChallengePurpose, origin: string, requestId: string, grant?: string) {
      configured();
      if (!config.captchaEnabled) return;
      const p = policy(),
        key = riskKey(purpose, origin);
      // Locking this origin/purpose bucket makes concurrent first attempts count honestly.
      const allowed = await identityTransaction(db, async (client) => {
        await client.query('INSERT INTO core.auth_buckets(key_hash) VALUES ($1) ON CONFLICT DO NOTHING', [key]);
        await client.query('SELECT key_hash FROM core.auth_buckets WHERE key_hash = $1 FOR UPDATE', [key]);
        const previous = await client.query<{ count: number }>(
          "UPDATE core.auth_buckets SET attempted_at = ARRAY(SELECT t FROM unnest(attempted_at) t WHERE t > clock_timestamp() - $2 * interval '1 second' ORDER BY t DESC LIMIT 299) WHERE key_hash = $1 RETURNING cardinality(attempted_at) AS count",
          [key, config.windowSeconds],
        );
        const required = (previous.rows[0]?.count ?? p.threshold) >= p.threshold;
        await client.query(
          'UPDATE core.auth_buckets SET attempted_at = array_append(attempted_at,clock_timestamp()) WHERE key_hash = $1',
          [key],
        );
        if (!required && grant === undefined) return true;
        if (grant === undefined || !opaque.test(grant)) {
          await audit(client, 'challenge_required', requestId);
          return false;
        }
        await client.query('SELECT token_hash FROM core.captcha_challenges WHERE grant_hash = $1 FOR UPDATE', [
          keyed('grant', grant),
        ]);
        const claimed = await client.query(
          'UPDATE core.captcha_challenges SET grant_consumed_at = clock_timestamp() WHERE grant_hash = $1 AND origin_hash = $2 AND purpose = $3 AND grant_consumed_at IS NULL AND grant_expires_at > clock_timestamp()',
          [keyed('grant', grant), keyed('origin', origin), purpose],
        );
        await audit(client, claimed.rowCount === 1 ? 'challenge_consumed' : 'challenge_rejected', requestId);
        return claimed.rowCount === 1;
      });
      if (!allowed) throw new AuthFailure(403);
    },
  };
}
