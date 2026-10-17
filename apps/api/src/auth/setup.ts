import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { Db } from '@boro-biya/db';
import type { AuthConfig } from './config.js';
import { AuthFailure } from './failure.js';
import { generateSetupCredential, normalizeAnswer, validPassword, type PasswordHasher } from './passwords.js';
import { normalizeUsername } from '../identity/account.js';
import { identityTransaction } from '../identity/transaction.js';
import { hasPermission } from './policy.js';
import { lockCurrentBinding } from '../identity/binding.js';

type Client = Pick<Db['pool'], 'query'>;
type Reserve = (scope: string, value: string, limit: number, requestId: string) => Promise<void>;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
interface User {
  id: string;
  password_hash: string;
  username_normalized: string;
  account_status: string;
  password_setup_required: boolean;
  security_setup_required: boolean;
  credential_live: boolean;
}
export function createSetupService(
  db: Pick<Db, 'pool'>,
  config: AuthConfig,
  hasher: PasswordHasher,
  dummyHash: string,
  reserve: Reserve,
) {
  async function user(client: Client, id: string) {
    const result = await client.query<User>(
      `SELECT id, password_hash, username_normalized, account_status, password_setup_required, security_setup_required,
      setup_credential_consumed_at IS NULL AND setup_credential_expires_at > clock_timestamp() AS credential_live FROM core.users WHERE id = $1`,
      [id],
    );
    return result.rows[0];
  }
  async function audit(client: Client, action: string, actor: string, target: string, requestId: string) {
    await client.query(
      "INSERT INTO core.audit_events(actor_id, actor_type, action, target_type, target_id, request_id) VALUES ($1, 'user', $2, 'user', $3, $4)",
      [actor, action, target, requestId],
    );
  }
  async function admin(client: Client, actorId: string, sessionId: string) {
    if (!(await lockCurrentBinding(client, actorId, sessionId))) throw new AuthFailure();
    if (!(await hasPermission(client, actorId, 'users.create'))) throw new AuthFailure(403);
    return user(client, actorId);
  }
  async function flow<T>(
    raw: string | undefined,
    operation: (client: Client, current: User, tokenHash: string) => Promise<T> | T,
  ) {
    if (config.captchaEnabled) throw new AuthFailure(503);
    if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) throw new AuthFailure();
    const tokenHash = hash(raw);
    const found = await db.pool.query<{ user_id: string }>(
      'SELECT user_id FROM core.account_setup_flows WHERE token_hash = $1',
      [tokenHash],
    );
    const id = found.rows[0]?.user_id;
    if (!id) throw new AuthFailure();
    return identityTransaction(db, async (client) => {
      await client.query('SELECT id FROM core.users WHERE id = $1 FOR UPDATE', [id]);
      const current = await user(client, id);
      const proof = await client.query<{ credential_fingerprint: string; live: boolean }>(
        'SELECT credential_fingerprint, consumed_at IS NULL AND expires_at > clock_timestamp() AS live FROM core.account_setup_flows WHERE token_hash = $1 FOR UPDATE',
        [tokenHash],
      );
      const row = proof.rows[0];
      if (
        !current ||
        current.account_status !== 'active' ||
        !current.security_setup_required ||
        !row?.live ||
        row.credential_fingerprint !== hash(current.password_hash)
      )
        throw new AuthFailure();
      return operation(client, current, tokenHash);
    });
  }
  return {
    async create(
      actorId: string,
      sessionId: string,
      currentPassword: string,
      input: { username: string; temporaryPassword?: string },
      origin: string,
      requestId: string,
    ) {
      if (config.captchaEnabled) throw new AuthFailure(503);
      await reserve('admin-create-origin', origin, config.maxOriginAttempts, requestId);
      await reserve('admin-create-account', actorId, config.maxAccountAttempts, requestId);
      const snapshot = await identityTransaction(db, (client) => admin(client, actorId, sessionId));
      if (!snapshot || !(await hasher.verify(snapshot.password_hash, currentPassword))) throw new AuthFailure();
      let username: ReturnType<typeof normalizeUsername>;
      try {
        username = normalizeUsername(input.username);
      } catch {
        throw new AuthFailure(400);
      }
      const generated = input.temporaryPassword === undefined;
      const credential = input.temporaryPassword ?? generateSetupCredential(username.normalized);
      if (!validPassword(credential, username.normalized)) throw new AuthFailure(400);
      const encoded = await hasher.hash(credential);
      try {
        return await identityTransaction(db, async (client) => {
          const current = await admin(client, actorId, sessionId);
          if (current?.password_hash !== snapshot.password_hash) throw new AuthFailure();
          const inserted = await client.query<{ id: string; setup_credential_expires_at: Date }>(
            `INSERT INTO core.users(username_normalized, username_display, password_hash, password_setup_required, security_setup_required, setup_credential_expires_at)
            VALUES ($1, $2, $3, true, true, clock_timestamp() + interval '24 hours') RETURNING id, setup_credential_expires_at`,
            [username.normalized, username.display, encoded],
          );
          const created = inserted.rows[0]!;
          const assigned = await client.query(
            "INSERT INTO core.user_roles(user_id, role_id, assigned_by) SELECT $1, id, $2 FROM core.roles WHERE key = 'user'",
            [created.id, actorId],
          );
          if (assigned.rowCount !== 1) throw new AuthFailure(503);
          await audit(client, 'account_created_by_admin', actorId, created.id, requestId);
          await audit(client, 'setup_credential_issued', actorId, created.id, requestId);
          return {
            id: created.id,
            username: username.display,
            expiresAt: created.setup_credential_expires_at.toISOString(),
            ...(generated ? { setupCredential: credential } : {}),
          };
        });
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505')
          throw new AuthFailure(400);
        throw error;
      }
    },
    async begin(usernameInput: string, credential: string, origin: string, requestId: string) {
      if (config.captchaEnabled) throw new AuthFailure(503);
      await reserve('setup-start-origin', origin, config.maxOriginAttempts, requestId);
      let username = '';
      try {
        username = normalizeUsername(usernameInput).normalized;
      } catch {
        /* generic denial */
      }
      await reserve('setup-start-account', username || usernameInput, config.maxAccountAttempts, requestId);
      const lookup = await db.pool.query<{ id: string }>('SELECT id FROM core.users WHERE username_normalized = $1', [
        username,
      ]);
      const snapshot = lookup.rows[0] ? await user(db.pool, lookup.rows[0].id) : undefined;
      const matched = await hasher.verify(snapshot?.password_hash ?? dummyHash, credential);
      if (
        !matched ||
        !snapshot ||
        snapshot.account_status !== 'active' ||
        !snapshot.credential_live ||
        !snapshot.password_setup_required ||
        !snapshot.security_setup_required
      )
        throw new AuthFailure();
      const raw = randomBytes(32).toString('base64url');
      const expiresAt = await identityTransaction(db, async (client) => {
        await client.query('SELECT id FROM core.users WHERE id = $1 FOR UPDATE', [snapshot.id]);
        const current = await user(client, snapshot.id);
        if (
          !current?.credential_live ||
          current.account_status !== 'active' ||
          !current.password_setup_required ||
          !current.security_setup_required ||
          current.password_hash !== snapshot.password_hash
        )
          throw new AuthFailure();
        await client.query('UPDATE core.users SET setup_credential_consumed_at = clock_timestamp() WHERE id = $1', [
          current.id,
        ]);
        const proof = await client.query<{ expires_at: Date }>(
          "INSERT INTO core.account_setup_flows(token_hash, user_id, credential_fingerprint, expires_at) VALUES ($1, $2, $3, clock_timestamp() + interval '10 minutes') RETURNING expires_at",
          [hash(raw), current.id, hash(current.password_hash)],
        );
        await audit(client, 'setup_credential_consumed', current.id, current.id, requestId);
        return proof.rows[0]!.expires_at;
      });
      return { token: raw, expiresAt };
    },
    status(raw: string | undefined) {
      return flow(raw, (_client, current) => ({
        passwordSetupRequired: current.password_setup_required,
        securitySetupRequired: current.security_setup_required,
      }));
    },
    async password(
      raw: string | undefined,
      password: string,
      repeatPassword: string,
      origin: string,
      requestId: string,
    ) {
      await reserve('setup-password-origin', origin, config.maxOriginAttempts, requestId);
      const snapshot = await flow(raw, (_client, current) => current);
      await reserve('setup-step-account', snapshot.id, config.maxAccountAttempts, requestId);
      if (
        !snapshot.password_setup_required ||
        password !== repeatPassword ||
        !validPassword(password, snapshot.username_normalized)
      )
        throw new AuthFailure(400);
      if (await hasher.verify(snapshot.password_hash, password)) throw new AuthFailure(400);
      const encoded = await hasher.hash(password);
      await flow(raw, async (client, current, tokenHash) => {
        if (!current.password_setup_required || current.password_hash !== snapshot.password_hash)
          throw new AuthFailure();
        await client.query(
          'UPDATE core.users SET password_hash = $2, password_setup_required = false, updated_at = clock_timestamp() WHERE id = $1',
          [current.id, encoded],
        );
        await client.query('UPDATE core.account_setup_flows SET credential_fingerprint = $2 WHERE token_hash = $1', [
          tokenHash,
          hash(encoded),
        ]);
        await audit(client, 'setup_password_completed', current.id, current.id, requestId);
      });
    },
    async security(
      raw: string | undefined,
      input: Array<{ questionId: number; answer: string }>,
      origin: string,
      requestId: string,
    ) {
      await reserve('setup-security-origin', origin, config.maxOriginAttempts, requestId);
      const snapshot = await flow(raw, (_client, current) => current);
      await reserve('setup-step-account', snapshot.id, config.maxAccountAttempts, requestId);
      if (snapshot.password_setup_required) throw new AuthFailure();
      let normalized: string[];
      try {
        if (
          input.length !== 5 ||
          new Set(input.map((answer) => answer.questionId)).size !== 5 ||
          input.some((answer) => !Number.isInteger(answer.questionId) || answer.questionId < 1 || answer.questionId > 8)
        )
          throw new Error('invalid questions');
        normalized = input.map((answer) => normalizeAnswer(answer.answer));
      } catch {
        throw new AuthFailure(400);
      }
      const encoded: string[] = [];
      for (const answer of normalized) encoded.push(await hasher.hash(answer));
      await flow(raw, async (client, current) => {
        if (current.password_setup_required || current.password_hash !== snapshot.password_hash)
          throw new AuthFailure();
        const questions = await client.query(
          'SELECT id FROM core.security_questions WHERE active AND id = ANY($1::smallint[])',
          [input.map((answer) => answer.questionId)],
        );
        if (questions.rowCount !== 5) throw new AuthFailure(400);
        for (let index = 0; index < input.length; index++)
          await client.query(
            'INSERT INTO core.user_security_answers(user_id, question_id, answer_hash, normalization_version) VALUES ($1, $2, $3, 1)',
            [current.id, input[index]!.questionId, encoded[index]],
          );
        await client.query(
          'UPDATE core.users SET security_setup_required = false, failed_login_count = 0, failed_login_window_started_at = NULL, updated_at = clock_timestamp() WHERE id = $1',
          [current.id],
        );
        await client.query(
          'UPDATE core.account_setup_flows SET consumed_at = clock_timestamp() WHERE user_id = $1 AND consumed_at IS NULL',
          [current.id],
        );
        for (const scope of ['login-account', 'login-failure-account']) {
          const key = createHmac('sha256', config.secret)
            .update(`${scope}:${current.username_normalized}`)
            .digest('hex');
          await client.query('UPDATE core.auth_buckets SET attempted_at = $2 WHERE key_hash = $1', [key, []]);
        }
        await audit(client, 'setup_completed', current.id, current.id, requestId);
      });
    },
  };
}
