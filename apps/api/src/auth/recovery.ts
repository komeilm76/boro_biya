import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import type { Db } from '@boro-biya/db';
import { identityTransaction } from '../identity/transaction.js';
import { normalizeUsername } from '../identity/account.js';
import { normalizeAnswer, validPassword, type PasswordHasher } from './passwords.js';
import { AuthFailure } from './failure.js';
import type { AuthConfig } from './config.js';

type Client = Pick<Db['pool'], 'query'>;
type Reserve = (scope: string, value: string, limit: number, requestId: string) => Promise<void>;
interface Account {
  id: string;
  username_normalized: string;
  password_hash: string;
  account_status: string;
  password_setup_required: boolean;
  security_setup_required: boolean;
}
interface Answer {
  question_id: number;
  answer_hash: string;
  normalization_version: number;
}
interface Flow {
  token_hash: string;
  user_id: string | null;
  account_key_hash: string;
  credential_fingerprint: string | null;
  question_ids: number[];
  phase: string;
  attempts: number;
  live: boolean;
  grant_live: boolean;
  grant_hash: string | null;
}
const opaque = /^[A-Za-z0-9_-]{43}$/;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export function createRecoveryService(
  db: Pick<Db, 'pool'>,
  config: AuthConfig,
  hasher: PasswordHasher,
  dummyHash: string,
  reserve: Reserve,
) {
  const keyed = (value: string) => createHmac('sha256', config.secret).update(`recovery:${value}`).digest('hex');
  function enabled() {
    if (!config.recoveryEnabled || config.captchaEnabled) throw new AuthFailure(503);
  }
  async function account(client: Client, id: string) {
    const result = await client.query<Account>(
      'SELECT id, username_normalized, password_hash, account_status, password_setup_required, security_setup_required FROM core.users WHERE id = $1',
      [id],
    );
    const user = result.rows[0];
    const answers = await client.query<Answer>(
      'SELECT question_id, answer_hash, normalization_version FROM core.user_security_answers WHERE user_id = $1 ORDER BY question_id',
      [id],
    );
    const eligible =
      user !== undefined &&
      ['active', 'locked'].includes(user.account_status) &&
      !user.password_setup_required &&
      !user.security_setup_required &&
      answers.rows.length === 5 &&
      answers.rows.every((row) => row.normalization_version === 1);
    return {
      user,
      answers: answers.rows,
      fingerprint: eligible ? keyed(JSON.stringify([user.password_hash, answers.rows])) : null,
    };
  }
  async function lookup(raw: string | undefined) {
    if (raw === undefined || !opaque.test(raw)) throw new AuthFailure();
    const result = await db.pool.query<{ user_id: string | null; account_key_hash: string }>(
      'SELECT user_id, account_key_hash FROM core.password_reset_challenges WHERE token_hash = $1',
      [hash(raw)],
    );
    const flow = result.rows[0];
    if (!flow) throw new AuthFailure();
    return { ...flow, tokenHash: hash(raw) };
  }
  async function withFlow<T>(
    reference: Awaited<ReturnType<typeof lookup>>,
    operation: (client: Client, flow: Flow) => Promise<T>,
  ) {
    return identityTransaction(db, async (client) => {
      // All credential/lifecycle code takes the user lock before any recovery row lock.
      if (reference.user_id)
        await client.query('SELECT id FROM core.users WHERE id = $1 FOR UPDATE', [reference.user_id]);
      const result = await client.query<Flow>(
        `SELECT *, expires_at > clock_timestamp() AS live,
        grant_expires_at > clock_timestamp() AS grant_live FROM core.password_reset_challenges WHERE token_hash = $1 FOR UPDATE`,
        [reference.tokenHash],
      );
      const flow = result.rows[0];
      if (!flow) throw new AuthFailure();
      return operation(client, flow);
    });
  }
  async function admission(raw: string | undefined, origin: string, requestId: string, stage: string) {
    enabled();
    await reserve(`recovery-${stage}-origin`, origin, config.maxOriginAttempts, requestId);
    const flow = await lookup(raw);
    await reserve(`recovery-${stage}-account`, flow.account_key_hash, config.recoveryAttempts, requestId);
    return flow;
  }
  return {
    async forgot(usernameInput: string, origin: string, requestId: string) {
      enabled();
      await reserve('recovery-forgot-origin', origin, config.maxOriginAttempts, requestId);
      let username = '';
      try {
        username = normalizeUsername(usernameInput).normalized;
      } catch {
        /* same fake flow */
      }
      const accountKey = keyed(username || usernameInput);
      await reserve('recovery-forgot-account', accountKey, config.recoveryAttempts, requestId);
      const found = await db.pool.query<{ id: string }>('SELECT id FROM core.users WHERE username_normalized = $1', [
        username,
      ]);
      const raw = randomBytes(32).toString('base64url');
      const expiresAt = await identityTransaction(db, async (client) => {
        const id = found.rows[0]?.id;
        if (id) await client.query('SELECT id FROM core.users WHERE id = $1 FOR UPDATE', [id]);
        const state = id ? await account(client, id) : undefined;
        // A stable fake five-question set avoids exposing existence through question-set size
        // or repeatedly sampling all eight questions for missing accounts.
        const fake = [1, 2, 3, 4, 5, 6, 7, 8]
          .sort((a, b) => keyed(`${accountKey}:${a}`).localeCompare(keyed(`${accountKey}:${b}`)))
          .slice(0, 5);
        const pool = state?.fingerprint ? state.answers.map((answer) => answer.question_id) : fake;
        for (let i = pool.length - 1; i > 0; i--) {
          const j = randomInt(i + 1);
          [pool[i], pool[j]] = [pool[j]!, pool[i]!];
        }
        const inserted = await client.query<{ cookie_expires: Date }>(
          `INSERT INTO core.password_reset_challenges(token_hash, user_id, account_key_hash, credential_fingerprint, question_ids, expires_at)
          VALUES ($1, $2, $3, $4, $5, clock_timestamp() + $6 * interval '1 second')
          RETURNING expires_at + $7 * interval '1 second' AS cookie_expires`,
          [
            hash(raw),
            state?.fingerprint ? id : null,
            accountKey,
            state?.fingerprint ?? null,
            pool.slice(0, 3),
            config.recoveryChallengeTtlSeconds,
            config.recoveryGrantTtlSeconds,
          ],
        );
        return inserted.rows[0]!.cookie_expires;
      });
      return { token: raw, expiresAt };
    },
    async questions(raw: string | undefined, origin: string, requestId: string) {
      const reference = await admission(raw, origin, requestId, 'questions');
      return withFlow(reference, async (client, flow) => {
        if (flow.phase !== 'challenge' || !flow.live || flow.attempts >= config.recoveryAttempts)
          throw new AuthFailure();
        const result = await client.query<{ id: number; text_key: string }>(
          'SELECT id, text_key FROM core.security_questions WHERE id = ANY($1::smallint[]) ORDER BY id',
          [flow.question_ids],
        );
        return result.rows.map((row) => ({ id: row.id, textKey: row.text_key }));
      });
    },
    async verify(
      raw: string | undefined,
      input: Array<{ questionId: number; answer: string }>,
      origin: string,
      requestId: string,
    ) {
      const reference = await admission(raw, origin, requestId, 'verify');
      // Commit admission before native work: errors/restarts cannot recover spent guesses.
      const snapshot = await withFlow(reference, async (client, flow) => {
        if (flow.phase !== 'challenge' || !flow.live || flow.attempts >= config.recoveryAttempts)
          throw new AuthFailure();
        await client.query('UPDATE core.password_reset_challenges SET attempts = attempts + 1 WHERE token_hash = $1', [
          flow.token_hash,
        ]);
        const current = flow.user_id ? await account(client, flow.user_id) : undefined;
        return { flow, current };
      });
      const supplied = new Map(input.map((answer) => [answer.questionId, answer.answer]));
      let correct =
        input.length === 3 &&
        supplied.size === 3 &&
        input.every((answer) => snapshot.flow.question_ids.includes(answer.questionId));
      for (const id of snapshot.flow.question_ids) {
        let normalized = '';
        try {
          normalized = normalizeAnswer(supplied.get(id) ?? '');
        } catch {
          correct = false;
        }
        const stored = snapshot.current?.answers.find((answer) => answer.question_id === id)?.answer_hash ?? dummyHash;
        // Always run all three verifications; never return per-answer feedback.
        const matched = await hasher.verify(stored, normalized);
        if (!matched) correct = false;
      }
      const grant = randomBytes(32).toString('base64url');
      const expiresAt = await withFlow(reference, async (client, flow) => {
        const current = flow.user_id ? await account(client, flow.user_id) : undefined;
        if (flow.phase !== 'challenge' || !flow.live) return null;
        if (!correct || !current?.fingerprint || current.fingerprint !== flow.credential_fingerprint) {
          if (flow.attempts >= config.recoveryAttempts)
            await client.query("UPDATE core.password_reset_challenges SET phase = 'consumed' WHERE token_hash = $1", [
              flow.token_hash,
            ]);
          return null;
        }
        const result = await client.query<{ grant_expires_at: Date }>(
          `UPDATE core.password_reset_challenges SET phase = 'verified', grant_hash = $2,
          grant_expires_at = clock_timestamp() + $3 * interval '1 second' WHERE token_hash = $1 RETURNING grant_expires_at`,
          [flow.token_hash, hash(grant), config.recoveryGrantTtlSeconds],
        );
        return result.rows[0]!.grant_expires_at;
      });
      if (!expiresAt) throw new AuthFailure();
      return { token: grant, expiresAt };
    },
    async reset(
      raw: string | undefined,
      grant: string | undefined,
      password: string,
      repeatPassword: string,
      origin: string,
      requestId: string,
    ) {
      const reference = await admission(raw, origin, requestId, 'reset');
      if (grant === undefined || !opaque.test(grant)) throw new AuthFailure();
      const snapshot = await withFlow(reference, async (client, flow) => {
        if (flow.phase !== 'verified' || !flow.grant_live || flow.grant_hash !== hash(grant) || !flow.user_id)
          throw new AuthFailure();
        const current = await account(client, flow.user_id);
        if (!current.fingerprint || current.fingerprint !== flow.credential_fingerprint) throw new AuthFailure();
        return current;
      });
      if (password !== repeatPassword || !validPassword(password, snapshot.user!.username_normalized))
        throw new AuthFailure(400);
      const passwordHash = await hasher.hash(password);
      await withFlow(reference, async (client, flow) => {
        if (flow.phase !== 'verified' || !flow.grant_live || flow.grant_hash !== hash(grant) || !flow.user_id)
          throw new AuthFailure();
        const current = await account(client, flow.user_id);
        if (!current.fingerprint || current.fingerprint !== flow.credential_fingerprint) throw new AuthFailure();
        await client.query(
          `UPDATE core.users SET password_hash = $2, password_normalized_policy_version = 1,
          account_status = 'active', locked_until = NULL, failed_login_count = 0, failed_login_window_started_at = NULL,
          state_changed_at = clock_timestamp(), state_reason = 'password_reset', updated_at = clock_timestamp() WHERE id = $1`,
          [flow.user_id, passwordHash],
        );
        await client.query(
          "UPDATE core.password_reset_challenges SET phase = 'consumed', grant_hash = NULL, grant_expires_at = NULL WHERE user_id = $1",
          [flow.user_id],
        );
        await client.query(
          "UPDATE core.session_families SET revoked_at = clock_timestamp(), revocation_reason = 'password_reset' WHERE user_id = $1 AND revoked_at IS NULL",
          [flow.user_id],
        );
        await client.query(
          `INSERT INTO core.audit_events(actor_id, actor_type, action, target_type, target_id, request_id)
          VALUES ($1, 'user', 'password_reset', 'user', $1, $2)`,
          [flow.user_id, requestId],
        );
        await client.query("INSERT INTO core.notifications(recipient_id, event_type) VALUES ($1, 'password_reset')", [
          flow.user_id,
        ]);
        // Account-only login budgets must not prevent the documented recovery unlock path.
        for (const scope of ['login-account', 'login-failure-account']) {
          const loginKey = createHmac('sha256', config.secret)
            .update(`${scope}:${current.user!.username_normalized}`)
            .digest('hex');
          await client.query('UPDATE core.auth_buckets SET attempted_at = $2 WHERE key_hash = $1', [loginKey, []]);
        }
      });
    },
  };
}
