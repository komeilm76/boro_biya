import type { Db } from '@boro-biya/db';
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
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
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
        await client.query('COMMIT');
        return project(row);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
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
