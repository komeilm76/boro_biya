import type { AdminUsersQuery, AdminAuditQuery } from '@boro-biya/validation';
import { createHmac } from 'node:crypto';
import type { Db } from '@boro-biya/db';
import { identityTransaction } from '../identity/transaction.js';
import { lockCurrentBinding } from '../identity/binding.js';
import { generateSetupCredential, type PasswordHasher } from './passwords.js';
import type { AuthConfig } from './config.js';
import { AuthFailure } from './failure.js';
import {
  administrativePermissions,
  hasActiveAdministrator,
  hasPermission,
  type AdministrativePermission,
} from './policy.js';
type Client = Pick<Db['pool'], 'query'>;
type Reserve = (scope: string, value: string, limit: number, requestId: string) => Promise<void>;
export type StateAction = 'lock' | 'unlock' | 'ban' | 'unban' | 'deactivate' | 'reactivate';
const transitions: Record<StateAction, { from: string[]; to: string }> = {
  lock: { from: ['active'], to: 'locked' },
  unlock: { from: ['locked'], to: 'active' },
  ban: { from: ['active', 'locked'], to: 'banned' },
  unban: { from: ['banned'], to: 'active' },
  deactivate: { from: ['active', 'locked'], to: 'deactivated' },
  reactivate: { from: ['deactivated'], to: 'active' },
};
export interface AdminActor {
  userId: string;
  sessionId: string;
}
export function createAdministration(
  db: Pick<Db, 'pool'>,
  config: AuthConfig,
  hasher: PasswordHasher,
  dummyHash: string,
  reserve: Reserve,
) {
  async function audit(
    client: Client,
    actor: AdminActor,
    action: string,
    targetType: string,
    targetId: string | null,
    requestId: string,
    details: Record<string, unknown> = {},
  ) {
    await client.query(
      "INSERT INTO core.audit_events(actor_id, actor_type, action, target_type, target_id, request_id, details) VALUES ($1, 'user', $2, $3, $4, $5, $6)",
      [actor.userId, action, targetType, targetId, requestId, JSON.stringify({ source: 'administrator', ...details })],
    );
  }
  async function authorized<T>(
    actor: AdminActor,
    permission: AdministrativePermission,
    requestId: string,
    work: (client: Client) => Promise<T>,
    mutation?: { password: string; origin: string },
  ) {
    let snapshot: string | undefined;
    if (mutation) {
      await reserve('admin-mutation-origin', mutation.origin, config.maxOriginAttempts, requestId);
      await reserve('admin-mutation-account', actor.userId, config.maxAccountAttempts, requestId);
      const row = await db.pool.query<{ password_hash: string }>('SELECT password_hash FROM core.users WHERE id = $1', [
        actor.userId,
      ]);
      snapshot = row.rows[0]?.password_hash;
      if (!(await hasher.verify(snapshot ?? dummyHash, mutation.password)) || !snapshot) throw new AuthFailure();
    }
    const result = await identityTransaction(db, async (client) => {
      // All administrative writes serialize BEFORE acquiring user locks. Existing credential
      // code takes only user locks; sorted locking of all users prevents cross-target cycles.
      if (mutation) {
        await client.query('SELECT pg_advisory_xact_lock(42802, 1)');
        await client.query('SELECT id FROM core.users ORDER BY id FOR UPDATE');
      }
      if (!(await lockCurrentBinding(client, actor.userId, actor.sessionId))) return { error: 401 } as const;
      if (!(await hasPermission(client, actor.userId, permission))) {
        await audit(client, actor, 'authorization_denied', 'permission', null, requestId, { permission });
        return { error: 403 } as const;
      }
      if (mutation) {
        const current = await client.query<{ password_hash: string }>(
          'SELECT password_hash FROM core.users WHERE id = $1',
          [actor.userId],
        );
        if (current.rows[0]?.password_hash !== snapshot) return { error: 401 } as const;
        await client.query('SAVEPOINT administrative_change');
      }
      const value = await work(client);
      if (mutation && !(await hasActiveAdministrator(client))) {
        const attempted = await client.query<{
          action: string;
          target_type: string;
          target_id: string | null;
          details: Record<string, unknown>;
        }>(
          'SELECT action, target_type, target_id, details FROM core.audit_events WHERE actor_id = $1 AND request_id = $2 ORDER BY id DESC LIMIT 1',
          [actor.userId, requestId],
        );
        const event = attempted.rows[0];
        await client.query('ROLLBACK TO SAVEPOINT administrative_change');
        await audit(
          client,
          actor,
          'last_administrator_change_denied',
          event?.target_type ?? 'permission',
          event?.target_id ?? null,
          requestId,
          { permission, attemptedAction: event?.action, ...event?.details },
        );
        return { error: 409 } as const;
      }
      return { value } as const;
    });
    if ('error' in result) throw new AuthFailure(result.error);
    return result.value;
  }
  async function revoke(client: Client, userId: string, reason: string) {
    await client.query(
      'UPDATE core.session_families SET revoked_at = clock_timestamp(), revocation_reason = $2 WHERE user_id = $1 AND revoked_at IS NULL',
      [userId, reason],
    );
    await client.query(
      "UPDATE core.password_reset_challenges SET phase = 'consumed', grant_hash = NULL, grant_expires_at = NULL WHERE user_id = $1",
      [userId],
    );
    await client.query(
      'UPDATE core.account_setup_flows SET consumed_at = clock_timestamp() WHERE user_id = $1 AND consumed_at IS NULL',
      [userId],
    );
  }
  return {
    users(actor: AdminActor, requestId: string, query: AdminUsersQuery = {}) {
      return authorized(actor, 'users.read', requestId, async (client) => {
        await audit(client, actor, 'admin_users_viewed', 'user', null, requestId, {
          filters: Object.keys(query).filter((key) => key !== 'cursor'),
        });
        const rows = await client.query<{
          id: string;
          username_display: string;
          account_status: string;
          password_setup_required: boolean;
          security_setup_required: boolean;
          state_reason: string | null;
          state_changed_at: Date;
        }>(
          `SELECT id, username_display, account_status, password_setup_required, security_setup_required, state_reason, state_changed_at FROM core.users u WHERE ($1::uuid IS NULL OR id > $1)
          AND ($2::text IS NULL OR strpos(username_normalized,$2) > 0)
          AND ($3::text IS NULL OR account_status = $3)
          AND ($4::boolean IS NULL OR (password_setup_required OR security_setup_required) = $4)
          AND ($5::uuid IS NULL OR EXISTS (SELECT 1 FROM core.user_roles ur WHERE ur.user_id = u.id AND ur.role_id = $5))
          ORDER BY id LIMIT 51`,
          [
            query.cursor ?? null,
            query.username ?? null,
            query.status ?? null,
            query.setupRequired === undefined ? null : query.setupRequired === 'true',
            query.roleId ?? null,
          ],
        );
        return {
          items: rows.rows.slice(0, 50).map((row) => ({
            id: row.id,
            username: row.username_display,
            status: row.account_status,
            passwordSetupRequired: row.password_setup_required,
            securitySetupRequired: row.security_setup_required,
            reason: row.state_reason,
            stateChangedAt: row.state_changed_at.toISOString(),
          })),
          nextCursor: rows.rows.length > 50 ? rows.rows[49]!.id : null,
        };
      });
    },
    user(actor: AdminActor, targetId: string, requestId: string) {
      return authorized(actor, 'users.read', requestId, async (client) => {
        const result = await client.query<{
          id: string;
          username_display: string;
          account_status: string;
          password_setup_required: boolean;
          security_setup_required: boolean;
          state_reason: string | null;
          state_changed_at: Date;
        }>(
          'SELECT id, username_display, account_status, password_setup_required, security_setup_required, state_reason, state_changed_at FROM core.users WHERE id = $1',
          [targetId],
        );
        const row = result.rows[0];
        if (!row) throw new AuthFailure(404);
        const roles = await client.query<{ role_id: string }>(
          'SELECT role_id FROM core.user_roles WHERE user_id = $1 ORDER BY role_id',
          [targetId],
        );
        await audit(client, actor, 'admin_user_viewed', 'user', targetId, requestId);
        return {
          id: row.id,
          username: row.username_display,
          status: row.account_status,
          passwordSetupRequired: row.password_setup_required,
          securitySetupRequired: row.security_setup_required,
          reason: row.state_reason,
          stateChangedAt: row.state_changed_at.toISOString(),
          roleIds: roles.rows.map((role) => role.role_id),
        };
      });
    },
    roles(actor: AdminActor, requestId: string, cursor?: string) {
      return authorized(actor, 'roles.read', requestId, async (client) => {
        await audit(client, actor, 'admin_roles_viewed', 'role', null, requestId);
        const rows = await client.query<{ id: string; key: string; name_key: string; permissions: string[] }>(
          `SELECT r.id, r.key, r.name_key, COALESCE(array_agg(p.key ORDER BY p.key) FILTER (WHERE p.key IS NOT NULL), '{}') AS permissions FROM core.roles r LEFT JOIN core.role_permissions rp ON rp.role_id = r.id LEFT JOIN core.permissions p ON p.id = rp.permission_id WHERE ($1::uuid IS NULL OR r.id > $1) GROUP BY r.id ORDER BY r.id LIMIT 51`,
          [cursor ?? null],
        );
        return {
          items: rows.rows.slice(0, 50).map((row) => ({
            id: row.id,
            key: row.key,
            nameKey: row.name_key,
            permissions: row.permissions,
          })),
          permissions: administrativePermissions,
          nextCursor: rows.rows.length > 50 ? rows.rows[49]!.id : null,
        };
      });
    },
    auditEvents(actor: AdminActor, requestId: string, query: AdminAuditQuery = {}) {
      return authorized(actor, 'audit.read', requestId, async (client) => {
        await audit(client, actor, 'admin_audit_viewed', 'audit', null, requestId, {
          filters: Object.keys(query).filter((key) => key !== 'cursor'),
        });
        const rows = await client.query<{
          id: string;
          actor_id: string | null;
          action: string;
          target_type: string;
          target_id: string | null;
          created_at: Date;
          details: Record<string, unknown>;
        }>(
          `SELECT id, actor_id, action, target_type, target_id, created_at, details FROM core.audit_events WHERE ($1::uuid IS NULL OR id < $1)
          AND ($2::uuid IS NULL OR actor_id = $2) AND ($3::text IS NULL OR action = $3)
          AND ($4::uuid IS NULL OR target_id = $4) AND ($5::text IS NULL OR target_type = $5)
          AND ($6::timestamptz IS NULL OR created_at >= $6) AND ($7::timestamptz IS NULL OR created_at < $7)
          ORDER BY id DESC LIMIT 51`,
          [
            query.cursor ?? null,
            query.actorId ?? null,
            query.action ?? null,
            query.targetId ?? null,
            query.targetType ?? null,
            query.from ?? null,
            query.to ?? null,
          ],
        );
        return {
          items: rows.rows.slice(0, 50).map((row) => ({
            id: row.id,
            actorId: row.actor_id,
            action: row.action,
            targetType: row.target_type,
            targetId: row.target_id,
            createdAt: row.created_at.toISOString(),
            details: row.details,
          })),
          nextCursor: rows.rows.length > 50 ? rows.rows[49]!.id : null,
        };
      });
    },
    state(
      actor: AdminActor,
      targetId: string,
      action: StateAction,
      reason: string,
      password: string,
      origin: string,
      requestId: string,
    ) {
      return authorized(
        actor,
        'users.state',
        requestId,
        async (client) => {
          const result = await client.query<{ account_status: string; username_normalized: string }>(
            'SELECT account_status, username_normalized FROM core.users WHERE id = $1',
            [targetId],
          );
          const target = result.rows[0];
          if (!target) throw new AuthFailure(404);
          const transition = transitions[action];
          if (!transition.from.includes(target.account_status)) throw new AuthFailure(409);
          await client.query(
            `UPDATE core.users SET account_status = $2, state_reason = $3, state_actor_id = $4, state_changed_at = clock_timestamp(), updated_at = clock_timestamp(), locked_until = CASE WHEN $2 = 'locked' THEN clock_timestamp() + $5 * interval '1 second' ELSE NULL END, failed_login_count = 0, failed_login_window_started_at = NULL WHERE id = $1`,
            [targetId, transition.to, reason, actor.userId, config.lockoutSeconds],
          );
          await revoke(client, targetId, `admin_${action}`);
          if (transition.to === 'active')
            for (const scope of ['login-account', 'login-failure-account']) {
              const key = createHmac('sha256', config.secret)
                .update(`${scope}:${target.username_normalized}`)
                .digest('hex');
              await client.query('UPDATE core.auth_buckets SET attempted_at = $2 WHERE key_hash = $1', [key, []]);
            }
          await audit(client, actor, `account_${action}`, 'user', targetId, requestId, {
            previous: target.account_status,
            next: transition.to,
            reason,
            source: 'administrator',
          });
          return { accepted: true };
        },
        { password, origin },
      );
    },
    reissueSetupCredential(
      actor: AdminActor,
      targetId: string,
      reason: string,
      password: string,
      origin: string,
      requestId: string,
    ) {
      return authorized(
        actor,
        'users.state',
        requestId,
        async (client) => {
          const found = await client.query<{
            username_normalized: string;
            username_display: string;
            account_status: string;
            password_setup_required: boolean;
            security_setup_required: boolean;
            setup_credential_expires_at: Date | null;
          }>(
            // Also lock explicitly: a concurrent creation can commit after the all-user scan snapshot.
            'SELECT account_status, username_normalized, username_display, password_setup_required, security_setup_required, setup_credential_expires_at FROM core.users WHERE id = $1 FOR UPDATE',
            [targetId],
          );
          const target = found.rows[0];
          if (!target) throw new AuthFailure(404);
          // Initial setup only: never an administrator reset of a completed/self-registered account.
          if (
            target.account_status !== 'active' ||
            !target.security_setup_required ||
            target.setup_credential_expires_at === null
          )
            throw new AuthFailure(409);
          const credential = generateSetupCredential(target.username_normalized);
          const encoded = await hasher.hash(credential);
          const updated = await client.query<{ setup_credential_expires_at: Date }>(
            "UPDATE core.users SET password_hash = $2, password_setup_required = true, security_setup_required = true, setup_credential_consumed_at = NULL, setup_credential_expires_at = clock_timestamp() + interval '24 hours', updated_at = clock_timestamp() WHERE id = $1 RETURNING setup_credential_expires_at",
            [targetId, encoded],
          );
          await revoke(client, targetId, 'setup_credential_reissued');
          for (const [scope, value] of [
            ['setup-start-account', target.username_normalized],
            ['setup-step-account', targetId],
          ]) {
            const key = createHmac('sha256', config.secret).update(`${scope}:${value}`).digest('hex');
            await client.query('UPDATE core.auth_buckets SET attempted_at = $2 WHERE key_hash = $1', [key, []]);
          }
          const expiresAt = updated.rows[0]!.setup_credential_expires_at.toISOString();
          await audit(client, actor, 'setup_credential_reissued', 'user', targetId, requestId, {
            reason,
            source: 'administrator',
            previous: {
              passwordSetupRequired: target.password_setup_required,
              securitySetupRequired: target.security_setup_required,
            },
            next: { passwordSetupRequired: true, securitySetupRequired: true, expiresAt },
          });
          return { id: targetId, username: target.username_display, expiresAt, setupCredential: credential };
        },
        { password, origin },
      );
    },
    assignRoles(
      actor: AdminActor,
      targetId: string,
      roleIds: string[],
      password: string,
      origin: string,
      requestId: string,
    ) {
      return authorized(
        actor,
        'users.roles',
        requestId,
        async (client) => {
          if ((await client.query('SELECT id FROM core.users WHERE id = $1', [targetId])).rowCount !== 1)
            throw new AuthFailure(404);
          const valid = await client.query('SELECT id FROM core.roles WHERE id = ANY($1::uuid[])', [roleIds]);
          if (valid.rowCount !== roleIds.length) throw new AuthFailure(400);
          const before = await client.query<{ role_id: string }>(
            'SELECT role_id FROM core.user_roles WHERE user_id = $1 ORDER BY role_id',
            [targetId],
          );
          await client.query('DELETE FROM core.user_roles WHERE user_id = $1', [targetId]);
          for (const roleId of roleIds)
            await client.query('INSERT INTO core.user_roles(user_id, role_id, assigned_by) VALUES ($1,$2,$3)', [
              targetId,
              roleId,
              actor.userId,
            ]);
          await audit(client, actor, 'user_roles_changed', 'user', targetId, requestId, {
            previous: before.rows.map((row) => row.role_id),
            next: roleIds,
          });
          return { accepted: true };
        },
        { password, origin },
      );
    },
    saveRole(
      actor: AdminActor,
      roleId: string | undefined,
      input: { key?: string; nameKey: string; permissions: string[] },
      password: string,
      origin: string,
      requestId: string,
    ) {
      return authorized(
        actor,
        'roles.manage',
        requestId,
        async (client) => {
          const valid = await client.query<{ id: string }>(
            'SELECT id FROM core.permissions WHERE key = ANY($1::text[])',
            [input.permissions],
          );
          if (valid.rowCount !== input.permissions.length) throw new AuthFailure(400);
          let id = roleId;
          let previous: { key: string; name_key: string; permissions: string[] } | null = null;
          if (id) {
            const found = await client.query<{ key: string; name_key: string; permissions: string[] }>(
              `SELECT r.key,r.name_key,COALESCE(array_agg(p.key ORDER BY p.key) FILTER (WHERE p.key IS NOT NULL),'{}') AS permissions FROM core.roles r LEFT JOIN core.role_permissions rp ON rp.role_id = r.id LEFT JOIN core.permissions p ON p.id = rp.permission_id WHERE r.id = $1 GROUP BY r.id`,
              [id],
            );
            previous = found.rows[0] ?? null;
            if (!previous) throw new AuthFailure(404);
            await client.query(
              'UPDATE core.roles SET name_key = $2, updated_by = $3, updated_at = clock_timestamp() WHERE id = $1',
              [id, input.nameKey, actor.userId],
            );
          } else {
            const created = await client.query<{ id: string }>(
              'INSERT INTO core.roles(key,name_key,created_by,updated_by) VALUES ($1,$2,$3,$3) ON CONFLICT (key) DO NOTHING RETURNING id',
              [input.key, input.nameKey, actor.userId],
            );
            id = created.rows[0]?.id;
            if (!id) throw new AuthFailure(409);
          }
          await client.query('DELETE FROM core.role_permissions WHERE role_id = $1', [id]);
          for (const permission of valid.rows)
            await client.query(
              'INSERT INTO core.role_permissions(role_id,permission_id,granted_by) VALUES ($1,$2,$3)',
              [id, permission.id, actor.userId],
            );
          await audit(client, actor, roleId ? 'role_changed' : 'role_created', 'role', id, requestId, {
            previous,
            next: { key: previous?.key ?? input.key, nameKey: input.nameKey, permissions: input.permissions },
          });
          return { id };
        },
        { password, origin },
      );
    },
  };
}
