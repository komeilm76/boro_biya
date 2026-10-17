import type { Db } from '@boro-biya/db';
import type { AuthConfig } from './config.js';
import { AuthFailure } from './failure.js';
import { normalizeAnswer, type PasswordHasher } from './passwords.js';
import { identityTransaction } from '../identity/transaction.js';
import { lockCurrentBinding } from '../identity/binding.js';

type Reserve = (scope: string, value: string, limit: number, requestId: string) => Promise<void>;

/** Current-password confirmation is required every time, even for a freshly issued bearer. */
export function createSecurityAnswerService(
  db: Pick<Db, 'pool'>,
  config: AuthConfig,
  hasher: PasswordHasher,
  dummyHash: string,
  reserve: Reserve,
) {
  return async function changeSecurityAnswers(
    userId: string,
    sessionId: string,
    currentPassword: string,
    input: Array<{ questionId: number; answer: string }>,
    origin: string,
    requestId: string,
  ) {
    await reserve('answers-change-origin', origin, config.maxOriginAttempts, requestId);
    await reserve('answers-change-account', userId, config.maxAccountAttempts, requestId);
    let normalized: string[];
    try {
      if (
        input.length !== 5 ||
        new Set(input.map((answer) => answer.questionId)).size !== 5 ||
        input.some((answer) => !Number.isInteger(answer.questionId) || answer.questionId < 1 || answer.questionId > 8)
      )
        throw new AuthFailure(400);
      normalized = input.map((answer) => normalizeAnswer(answer.answer));
    } catch {
      throw new AuthFailure(400);
    }
    const found = await db.pool.query<{ password_hash: string }>('SELECT password_hash FROM core.users WHERE id = $1', [
      userId,
    ]);
    const snapshot = found.rows[0];
    if (!(await hasher.verify(snapshot?.password_hash ?? dummyHash, currentPassword)) || !snapshot)
      throw new AuthFailure();
    const hashes: string[] = [];
    // Native work is deliberately sequential and outside the user lock.
    for (const answer of normalized) hashes.push(await hasher.hash(answer));
    await identityTransaction(db, async (client) => {
      if (!(await lockCurrentBinding(client, userId, sessionId))) throw new AuthFailure();
      const current = await client.query<{ password_hash: string }>(
        'SELECT password_hash FROM core.users WHERE id = $1',
        [userId],
      );
      if (current.rows[0]?.password_hash !== snapshot.password_hash) throw new AuthFailure();
      const catalogue = await client.query(
        'SELECT id FROM core.security_questions WHERE active AND id = ANY($1::smallint[])',
        [input.map((answer) => answer.questionId)],
      );
      if (catalogue.rowCount !== 5) throw new AuthFailure(400);
      await client.query('DELETE FROM core.user_security_answers WHERE user_id = $1', [userId]);
      for (let index = 0; index < input.length; index++) {
        await client.query(
          'INSERT INTO core.user_security_answers(user_id, question_id, answer_hash, normalization_version) VALUES ($1, $2, $3, 1)',
          [userId, input[index]!.questionId, hashes[index]],
        );
      }
      await client.query(
        "UPDATE core.password_reset_challenges SET phase = 'consumed', grant_hash = NULL, grant_expires_at = NULL WHERE user_id = $1",
        [userId],
      );
      await client.query(
        "UPDATE core.session_families SET revoked_at = clock_timestamp(), revocation_reason = 'security_answers_changed' WHERE user_id = $1 AND revoked_at IS NULL",
        [userId],
      );
      await client.query(
        "INSERT INTO core.audit_events(actor_id, actor_type, action, target_type, target_id, request_id) VALUES ($1, 'user', 'security_answers_changed', 'user', $1, $2)",
        [userId, requestId],
      );
      await client.query(
        "INSERT INTO core.notifications(recipient_id, event_type) VALUES ($1, 'security_answers_changed')",
        [userId],
      );
    });
  };
}
