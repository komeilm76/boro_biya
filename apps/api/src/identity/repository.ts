import type { Db } from '@boro-biya/db';
import { identityTransaction } from './transaction.js';
import { normalizeUsername, type Account, type AccountStatus } from './account.js';

interface AccountRow {
  id: string;
  username_display: string;
  account_status: AccountStatus;
  password_setup_required: boolean;
  security_setup_required: boolean;
}

function project(row: AccountRow): Account {
  return {
    id: row.id,
    username: row.username_display,
    status: row.account_status,
    passwordSetupRequired: row.password_setup_required,
    securitySetupRequired: row.security_setup_required,
  };
}

export interface CreateIdentity {
  username: string;
  /** Must be produced by the maintained Argon2id adapter, never a raw password. */
  passwordHash: string;
  passwordSetupRequired: boolean;
  securitySetupRequired: boolean;
  securityAnswers?: Array<{ questionId: number; hash: string }>;
  auditRequestId?: string;
}

/** Internal persistence seam, not a registration endpoint. The caller must validate password
 * policy and hash credentials, complete the security-answer workflow and audit the operation
 * before exposing account creation. No administrator promotion or account deletion path.
 * Parameterized SQL only (SEC-42); account plus default role are atomic (ADM-06).
 */
export function createIdentityRepository(db: Pick<Db, 'pool'>) {
  return {
    async create(input: CreateIdentity): Promise<Account> {
      const username = normalizeUsername(input.username);
      // Reject accidental plaintext before acquiring a connection; the database also checks
      // the algorithm marker. This guard is not cryptographic validation of an encoded hash.
      if (!input.passwordHash.startsWith('$argon2id$')) throw new Error('expected encoded Argon2id hash');
      if (
        input.securityAnswers !== undefined &&
        (input.securityAnswers.length !== 5 ||
          new Set(input.securityAnswers.map((answer) => answer.questionId)).size !== 5 ||
          input.securityAnswers.some(
            (answer) => !Number.isInteger(answer.questionId) || !answer.hash.startsWith('$argon2id$'),
          ))
      ) {
        throw new Error('five distinct hashed security answers required');
      }
      return identityTransaction(db, async (client) => {
        const result = await client.query<AccountRow>(
          `INSERT INTO core.users
            (username_normalized, username_display, username_normalization_version, password_hash,
             password_setup_required, security_setup_required)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, username_display, account_status, password_setup_required, security_setup_required`,
          [
            username.normalized,
            username.display,
            username.version,
            input.passwordHash,
            input.passwordSetupRequired,
            input.securitySetupRequired,
          ],
        );
        const row = result.rows[0];
        if (row === undefined) throw new Error('identity insert returned no account');
        const assigned = await client.query(
          `INSERT INTO core.user_roles(user_id, role_id)
           SELECT $1, id FROM core.roles WHERE key = $2`,
          [row.id, 'user'],
        );
        if (assigned.rowCount !== 1) throw new Error('default role unavailable');
        if (input.securityAnswers !== undefined) {
          for (const answer of input.securityAnswers) {
            const inserted = await client.query(
              `INSERT INTO core.user_security_answers(user_id, question_id, answer_hash, normalization_version)
               SELECT $1, id, $3, 1 FROM core.security_questions WHERE id = $2 AND active`,
              [row.id, answer.questionId, answer.hash],
            );
            if (inserted.rowCount !== 1) throw new Error('security question unavailable');
          }
        }
        if (input.auditRequestId !== undefined) {
          await client.query(
            `INSERT INTO core.audit_events(actor_id, actor_type, action, target_type, target_id, request_id)
             VALUES ($1, 'user', 'account_registered', 'user', $1, $2)`,
            [row.id, input.auditRequestId],
          );
        }
        return project(row);
      });
    },
    async findById(id: string): Promise<Account | null> {
      // Malformed identifiers fail without a database error containing caller material.
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null;
      const result = await db.pool.query<AccountRow>(
        `SELECT id, username_display, account_status, password_setup_required, security_setup_required
         FROM core.users WHERE id = $1`,
        [id],
      );
      return result.rows[0] === undefined ? null : project(result.rows[0]);
    },
  };
}
