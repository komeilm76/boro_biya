import { createSecurityStreams } from '../streams/security.js';
import { createReportingService } from '../security/reports.js';
import { createChallengeService } from './challenge.js';
import { createHash, createHmac } from 'node:crypto';
import type { Db } from '@boro-biya/db';
import { normalizeUsername } from '../identity/account.js';
import { createIdentityRepository } from '../identity/repository.js';
import { createSessionRepository } from '../identity/sessions.js';
import { lockCurrentBinding } from '../identity/binding.js';
import { identityTransaction } from '../identity/transaction.js';
import { createLoginBackoff } from './backoff.js';
import type { AuthConfig } from './config.js';
import { createPasswordHasher, normalizeAnswer, validPassword, type PasswordHasher } from './passwords.js';
import { createAccessTokens } from './tokens.js';

import { AuthFailure } from './failure.js';
import { createSecurityAnswerService } from './security-answers.js';
import { administrativePermissions } from './policy.js';
import { createAdministration } from './administration.js';
import { createSetupService } from './setup.js';
import { createRecoveryService } from './recovery.js';
export { AuthFailure } from './failure.js';

export interface Registration {
  username: string;
  password: string;
  repeatPassword: string;
  locale?: 'en' | 'fa' | undefined;
  answers: Array<{ questionId: number; answer: string }>;
}

export async function createAuthService(
  db: Pick<Db, 'pool'>,
  config: AuthConfig,
  hasher: PasswordHasher = createPasswordHasher(),
) {
  const identities = createIdentityRepository(db);
  const sessions = createSessionRepository(db, config.refreshTtlSeconds);
  const tokens = createAccessTokens(config);
  const dummyHash = await hasher.hash('missing-account timing fixture 84!');
  const key = (scope: string, value: string) =>
    createHmac('sha256', config.secret).update(`${scope}:${value}`).digest('hex');
  const backoff = createLoginBackoff(db, config, key);
  async function audit(action: string, requestId: string, userId?: string) {
    await db.pool.query(
      `INSERT INTO core.audit_events(actor_id, actor_type, action, target_type, target_id, request_id)
       VALUES ($1, $2, $3, 'user', $1, $4)`,
      [userId ?? null, userId === undefined ? 'anonymous' : 'user', action, requestId],
    );
  }
  async function reserve(scope: string, value: string, limit: number, requestId: string) {
    const hash = key(scope, value);
    const allowed = await identityTransaction(db, async (client) => {
      await client.query('INSERT INTO core.auth_buckets(key_hash) VALUES ($1) ON CONFLICT DO NOTHING', [hash]);
      await client.query('SELECT key_hash FROM core.auth_buckets WHERE key_hash = $1 FOR UPDATE', [hash]);
      const result = await client.query<{ count: number }>(
        `UPDATE core.auth_buckets SET attempted_at = ARRAY(
           SELECT t FROM unnest(attempted_at) t WHERE t > clock_timestamp() - $2 * interval '1 second')
         WHERE key_hash = $1 RETURNING cardinality(attempted_at) AS count`,
        [hash, config.windowSeconds],
      );
      if ((result.rows[0]?.count ?? limit) >= limit) return false;
      await client.query(
        'UPDATE core.auth_buckets SET attempted_at = array_append(attempted_at, clock_timestamp()) WHERE key_hash = $1',
        [hash],
      );
      return true;
    });
    if (!allowed) {
      await audit('rate_limit_denied', requestId);
      throw new AuthFailure(429, config.windowSeconds);
    }
  }

  const challenge = createChallengeService(db, config, reserve);

  async function failLogin(
    accountId: string | undefined,
    accountKey: string,
    origin: string,
    requestId: string,
  ): Promise<never> {
    await identityTransaction(db, async (client) => {
      if (accountId !== undefined)
        await client.query('SELECT id FROM core.users WHERE id = $1 FOR UPDATE', [accountId]);
      const failures = await backoff.record(client, accountKey, origin);
      if (accountId === undefined) return;
      await client.query(
        `UPDATE core.users SET failed_login_count = $2,
         failed_login_window_started_at = CASE WHEN $2 = 1 THEN clock_timestamp() ELSE failed_login_window_started_at END
         WHERE id = $1`,
        [accountId, failures],
      );
      if (failures >= config.maxAccountAttempts) {
        const locked = await client.query(
          `UPDATE core.users SET account_status = 'locked', locked_until = clock_timestamp() + $2 * interval '1 second',
           state_changed_at = clock_timestamp(), state_reason = 'failed_authentication'
           WHERE id = $1 AND account_status = 'active' RETURNING id`,
          [accountId, config.lockoutSeconds],
        );
        if (locked.rowCount === 1) {
          await client.query(
            `UPDATE core.session_families SET revoked_at = clock_timestamp(), revocation_reason = 'account_locked'
             WHERE user_id = $1 AND revoked_at IS NULL`,
            [accountId],
          );
          await client.query(
            `INSERT INTO core.audit_events(actor_id, actor_type, action, target_type, target_id, request_id)
             VALUES (NULL, 'system', 'account_locked', 'user', $1, $2)`,
            [accountId, requestId],
          );
        }
      }
    });
    await audit('login_failed', requestId);
    throw new AuthFailure();
  }

  return {
    config,
    challenge,
    reports: createReportingService(db, reserve),
    streams: createSecurityStreams(db, reserve),
    administration: createAdministration(db, config, hasher, dummyHash, reserve),
    setup: createSetupService(db, config, hasher, dummyHash, reserve),
    changeSecurityAnswers: createSecurityAnswerService(db, config, hasher, dummyHash, reserve),
    recovery: createRecoveryService(db, config, hasher, dummyHash, reserve),
    sessions,
    tokens,
    async catalogue() {
      const result = await db.pool.query<{ id: number; text_key: string }>(
        'SELECT id, text_key FROM core.security_questions WHERE active ORDER BY sort_order',
      );
      return result.rows.map((row) => ({ id: row.id, textKey: row.text_key }));
    },
    async register(input: Registration, origin: string, requestId: string, proof?: string) {
      challenge.configured();
      await reserve('register-origin', origin, config.maxOriginAttempts, requestId);
      await challenge.admit('register', origin, requestId, proof);
      let username: ReturnType<typeof normalizeUsername>;
      let answers: string[];
      try {
        username = normalizeUsername(input.username);
        if (
          input.password !== input.repeatPassword ||
          !validPassword(input.password, username.normalized) ||
          input.answers.length !== 5 ||
          new Set(input.answers.map((a) => a.questionId)).size !== 5
        )
          throw new AuthFailure(400);
        answers = input.answers.map((answer) => normalizeAnswer(answer.answer));
      } catch {
        throw new AuthFailure(400);
      }
      const hash = await hasher.hash(input.password);
      const securityAnswers = [];
      // Sequential hashes bound peak per-request memory rather than six native hashes at once.
      for (let i = 0; i < input.answers.length; i++) {
        securityAnswers.push({ questionId: input.answers[i]!.questionId, hash: await hasher.hash(answers[i]!) });
      }
      try {
        return await identities.create({
          username: username.display,
          passwordHash: hash,
          passwordSetupRequired: false,
          securitySetupRequired: false,
          securityAnswers,
          auditRequestId: requestId,
          locale: input.locale ?? 'en',
        });
      } catch (error) {
        // Never return duplicate-key details or the SQL driver's potentially credential-bearing text.
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          ['23505', '23503'].includes(String(error.code))
        )
          throw new AuthFailure(400);
        if (error instanceof Error && error.message === 'security question unavailable') throw new AuthFailure(400);
        throw new Error('account registration storage failed', { cause: error });
      }
    },
    async login(usernameInput: string, password: string, origin: string, requestId: string, proof?: string) {
      challenge.configured();
      await reserve('login-origin', origin, config.maxOriginAttempts, requestId);
      let username = '';
      try {
        username = normalizeUsername(usernameInput).normalized;
      } catch {
        /* same generic credential response */
      }
      const accountKey = username || key('invalid', usernameInput);
      await reserve('login-account', accountKey, config.maxAccountAttempts, requestId);
      const retryAfter = await backoff.check(accountKey, origin);
      if (retryAfter > 0) {
        await audit('login_backoff_denied', requestId);
        throw new AuthFailure(429, retryAfter);
      }
      await challenge.admit('login', origin, requestId, proof);
      const lookup = await db.pool.query<{ id: string; password_hash: string }>(
        'SELECT id, password_hash FROM core.users WHERE username_normalized = $1',
        [username],
      );
      const account = lookup.rows[0];
      const correct = await hasher.verify(account?.password_hash ?? dummyHash, password);
      if (!correct || account === undefined) return failLogin(account?.id, accountKey, origin, requestId);
      await identityTransaction(db, async (client) => {
        const unlocked = await client.query(
          `UPDATE core.users SET account_status = 'active', locked_until = NULL, failed_login_count = 0,
           state_changed_at = clock_timestamp(), state_reason = 'lockout_expired'
           WHERE id = $1 AND password_hash = $2 AND account_status = 'locked' AND locked_until <= clock_timestamp()
           RETURNING id`,
          [account.id, account.password_hash],
        );
        if (unlocked.rowCount === 1)
          await client.query(
            `INSERT INTO core.audit_events(actor_id, actor_type, action, target_type, target_id, request_id)
           VALUES (NULL, 'system', 'account_unlocked', 'user', $1, $2)`,
            [account.id, requestId],
          );
      });
      // Recheck the password snapshot while locking the account in the issuing transaction.
      const grant = await sessions.issue(account.id, account.password_hash);
      if (grant === null) return failLogin(account.id, accountKey, origin, requestId);
      await db.pool.query(
        'UPDATE core.users SET failed_login_count = 0, last_login_at = clock_timestamp() WHERE id = $1',
        [account.id],
      );
      await db.pool.query('UPDATE core.auth_buckets SET attempted_at = $2 WHERE key_hash = $1', [
        key('login-account', username),
        [],
      ]);
      await backoff.clearAccount(accountKey);
      await audit('login_succeeded', requestId, account.id);
      return { ...grant, accessToken: await tokens.sign(account.id, grant.sessionId) };
    },
    async authenticate(authorization: string | undefined) {
      if (authorization === undefined || !authorization.startsWith('Bearer ')) throw new AuthFailure();
      const claims = await tokens.verify(authorization.slice(7));
      if (claims === null || !(await sessions.isActive(claims.userId, claims.sessionId))) throw new AuthFailure();
      const account = await identities.findById(claims.userId);
      if (account === null) throw new AuthFailure();
      return { ...claims, account };
    },
    async refresh(secret: string, origin: string, requestId: string) {
      await reserve('refresh-origin', origin, Math.min(300, config.maxOriginAttempts * 2), requestId);
      const grant = await sessions.rotate(secret);
      if (grant === null) throw new AuthFailure();
      await audit('session_refreshed', requestId, grant.userId);
      return { ...grant, accessToken: await tokens.sign(grant.userId, grant.sessionId) };
    },
    async permissions(userId: string) {
      const result = await db.pool.query<{ key: string }>(
        `SELECT DISTINCT p.key FROM core.user_roles ur JOIN core.role_permissions rp ON rp.role_id = ur.role_id JOIN core.permissions p ON p.id = rp.permission_id WHERE ur.user_id = $1 AND p.key = ANY($2::text[]) ORDER BY p.key`,
        [userId, administrativePermissions],
      );
      return result.rows.map((row) => row.key);
    },
    async roles(userId: string) {
      const result = await db.pool.query<{ key: string }>(
        'SELECT r.key FROM core.roles r JOIN core.user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1 ORDER BY r.key',
        [userId],
      );
      return result.rows.map((row) => row.key);
    },
    async securityNotices(userId: string) {
      const result = await db.pool.query<{
        event_type: 'password_reset' | 'password_changed' | 'security_answers_changed';
        created_at: Date;
      }>(
        `SELECT event_type, created_at FROM core.notifications WHERE recipient_id = $1
         AND read_at IS NULL AND expires_at > clock_timestamp() ORDER BY created_at DESC, id DESC LIMIT 10`,
        [userId],
      );
      return result.rows.map((row) => ({ event: row.event_type, createdAt: row.created_at.toISOString() }));
    },
    async preferences(userId: string) {
      const result = await db.pool.query<{ locale: 'en' | 'fa' }>(
        "SELECT COALESCE((SELECT locale FROM core.user_preferences WHERE user_id = $1), 'en') AS locale",
        [userId],
      );
      return { locale: result.rows[0]?.locale ?? 'en' };
    },
    async savePreferences(userId: string, sessionId: string, locale: 'en' | 'fa') {
      await identityTransaction(db, async (client) => {
        if (!(await lockCurrentBinding(client, userId, sessionId))) throw new AuthFailure();
        await client.query(
          `INSERT INTO core.user_preferences(user_id, locale) VALUES ($1, $2)
          ON CONFLICT (user_id) DO UPDATE SET locale = EXCLUDED.locale, updated_at = clock_timestamp()`,
          [userId, locale],
        );
      });
      return { locale };
    },
    async changePassword(
      userId: string,
      sessionId: string,
      currentPassword: string,
      password: string,
      repeatPassword: string,
      requestId: string,
      origin?: string,
    ) {
      if (origin !== undefined) await reserve('password-change-origin', origin, config.maxOriginAttempts, requestId);
      await reserve('password-change-account', userId, config.maxAccountAttempts, requestId);
      const lookup = await db.pool.query<{ password_hash: string; username_normalized: string }>(
        'SELECT password_hash, username_normalized FROM core.users WHERE id = $1',
        [userId],
      );
      const account = lookup.rows[0];
      if (!(await hasher.verify(account?.password_hash ?? dummyHash, currentPassword)) || account === undefined)
        throw new AuthFailure();
      if (
        password !== repeatPassword ||
        !validPassword(password, account.username_normalized) ||
        password === currentPassword
      )
        throw new AuthFailure(400);
      const hash = await hasher.hash(password);
      await identityTransaction(db, async (client) => {
        if (!(await lockCurrentBinding(client, userId, sessionId))) throw new AuthFailure();
        const current = await client.query<{ password_hash: string }>(
          "SELECT password_hash FROM core.users WHERE id = $1 AND account_status = 'active' FOR UPDATE",
          [userId],
        );
        if (current.rows[0]?.password_hash !== account.password_hash) throw new AuthFailure();
        await client.query(
          'UPDATE core.users SET password_hash = $2, updated_at = clock_timestamp(), password_normalized_policy_version = 1 WHERE id = $1',
          [userId, hash],
        );
        await client.query(
          `UPDATE core.session_families SET revoked_at = clock_timestamp(), revocation_reason = 'password_changed'
           WHERE user_id = $1 AND revoked_at IS NULL`,
          [userId],
        );
        await client.query(
          `INSERT INTO core.audit_events(actor_id, actor_type, action, target_type, target_id, request_id)
          VALUES ($1, 'user', 'password_changed', 'user', $1, $2)`,
          [userId, requestId],
        );
        await client.query(
          "UPDATE core.password_reset_challenges SET phase = 'consumed', grant_hash = NULL, grant_expires_at = NULL WHERE user_id = $1",
          [userId],
        );
        await client.query("INSERT INTO core.notifications(recipient_id, event_type) VALUES ($1, 'password_changed')", [
          userId,
        ]);
      });
    },
    /** Cookie proof plus the route's origin/CSRF check permits logout even after access expiry. */
    async logout(refreshToken: string | undefined, requestId: string) {
      if (refreshToken === undefined || !/^[A-Za-z0-9_-]{43}$/.test(refreshToken)) return;
      await identityTransaction(db, async (client) => {
        const result = await client.query<{ user_id: string; family_id: string }>(
          'SELECT user_id, family_id FROM core.sessions WHERE refresh_token_hash = $1',
          [createHash('sha256').update(refreshToken).digest('hex')],
        );
        const session = result.rows[0];
        if (session === undefined) return;
        await client.query('SELECT id FROM core.users WHERE id = $1 FOR UPDATE', [session.user_id]);
        const revoked = await client.query(
          `UPDATE core.session_families SET revoked_at = clock_timestamp(), revocation_reason = 'logout'
           WHERE user_id = $1 AND id = $2 AND revoked_at IS NULL`,
          [session.user_id, session.family_id],
        );
        if (revoked.rowCount !== 1) return;
        await client.query(
          `INSERT INTO core.audit_events(actor_id, actor_type, action, target_type, target_id, request_id)
          VALUES ($1, 'user', 'logout', 'user', $1, $2)`,
          [session.user_id, requestId],
        );
      });
    },
    async revokeOthers(userId: string, sessionId: string, requestId: string) {
      await identityTransaction(db, async (client) => {
        if (!(await lockCurrentBinding(client, userId, sessionId))) throw new AuthFailure();
        await client.query(
          `UPDATE core.session_families SET revoked_at = clock_timestamp(), revocation_reason = 'owner_revoked_others'
           WHERE user_id = $1 AND revoked_at IS NULL AND id <> (
             SELECT family_id FROM core.sessions WHERE id = $2 AND user_id = $1)`,
          [userId, sessionId],
        );
        await client.query(
          `INSERT INTO core.audit_events(actor_id, actor_type, action, target_type, target_id, request_id)
          VALUES ($1, 'user', 'sessions_revoked', 'user', $1, $2)`,
          [userId, requestId],
        );
      });
    },
  };
}
export type AuthService = Awaited<ReturnType<typeof createAuthService>>;
