import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, initCluster, migrateDown, migrateUp, type Db } from '@boro-biya/db';
import { createDatabaseFor, injectedPgAdminUrl, type TestDatabaseHandle } from '@boro-biya/test-utils/pg';
import { createIdentityRepository } from '../../src/identity/repository.js';
import { createSessionRepository, type SessionGrant } from '../../src/identity/sessions.js';

let database: TestDatabaseHandle;
let db: Db;
let runtime: Db;
let sessions: ReturnType<typeof createSessionRepository>;
let identities: ReturnType<typeof createIdentityRepository>;
let sequence = 0;

beforeAll(async () => {
  database = await createDatabaseFor(injectedPgAdminUrl(), 'sessions');
  await initCluster({
    adminConnectionString: database.adminConnectionString,
    passwords: { core: 'sessions-test-only', relation: 'sessions-test-only', sos: 'sessions-test-only' },
    repoRoot: resolve('.'),
  });
  db = createDb({ connectionString: database.adminConnectionString });
  const url = new URL(database.adminConnectionString);
  url.username = 'boro_core';
  url.password = 'sessions-test-only';
  runtime = createDb({ connectionString: url.toString() });
  identities = createIdentityRepository(runtime);
  sessions = createSessionRepository(runtime);
});
afterAll(async () => {
  await runtime?.close();
  await db?.close();
  await database?.drop();
});

async function user(setup = false) {
  return identities.create({
    username: `session-user-${sequence++}`,
    passwordHash: '$argon2id$test-fixture',
    passwordSetupRequired: setup,
    securitySetupRequired: setup,
  });
}
function grant(value: SessionGrant | null): SessionGrant {
  expect(value).not.toBeNull();
  if (value === null) throw new Error('expected session grant');
  return value;
}

describe('session persistence and adversarial lifecycle (ADR-021, SEC-08, SEC-10, PRIV-21)', () => {
  it('stores only hashes, projects safe session metadata and rotates once without extending expiry', async () => {
    const account = await user();
    expect(await sessions.issue(account.id, '$argon2id$stale-password-snapshot')).toBeNull();
    const first = grant(await sessions.issue(account.id));
    expect(first.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await db.query('SELECT refresh_token_hash FROM core.sessions WHERE id = $1', [first.sessionId]);
    expect(stored.rows).toEqual([
      { refresh_token_hash: createHash('sha256').update(first.refreshToken).digest('hex') },
    ]);
    expect(JSON.stringify(stored.rows)).not.toContain(first.refreshToken);
    const second = grant(await sessions.rotate(first.refreshToken));
    expect(second.sessionId).not.toBe(first.sessionId);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.familyId).toBe(first.familyId);
    expect(second.expiresAt).toEqual(first.expiresAt);
    expect(await sessions.isActive(account.id, first.sessionId)).toBe(false);
    expect(await sessions.isActive(account.id, second.sessionId)).toBe(true);
    const list = await sessions.list(account.id);
    expect(list).toHaveLength(1);
    expect(list[0]?.familyId).toBe(first.familyId);
    expect(JSON.stringify(list)).not.toMatch(/refresh|hash|argon/);
  });

  it('commits whole-family revocation on replay, including the newest generation, but not other families', async () => {
    const account = await user();
    const first = grant(await sessions.issue(account.id));
    const independent = grant(await sessions.issue(account.id));
    const second = grant(await sessions.rotate(first.refreshToken));
    const third = grant(await sessions.rotate(second.refreshToken));
    expect(await sessions.rotate(first.refreshToken)).toBeNull();
    expect(await sessions.rotate(third.refreshToken)).toBeNull();
    expect(await sessions.isActive(account.id, third.sessionId)).toBe(false);
    expect(await sessions.isActive(account.id, independent.sessionId)).toBe(true);
    const reason = await db.query('SELECT revocation_reason FROM core.session_families WHERE id = $1', [
      first.familyId,
    ]);
    expect(reason.rows).toEqual([{ revocation_reason: 'refresh_reuse' }]);
  });

  it('serializes concurrent refreshes: one successor, then replay revokes that successor', async () => {
    const account = await user();
    const first = grant(await sessions.issue(account.id));
    const results = await Promise.all([sessions.rotate(first.refreshToken), sessions.rotate(first.refreshToken)]);
    expect(results.filter((value) => value !== null)).toHaveLength(1);
    expect(results.filter((value) => value === null)).toHaveLength(1);
    const successor = grant(results.find((value) => value !== null) ?? null);
    expect(await sessions.isActive(account.id, successor.sessionId)).toBe(false);
    expect(await sessions.rotate(successor.refreshToken)).toBeNull();
    expect(await sessions.list(account.id)).toEqual([]);
  });

  it('enforces ownership on lookup and revocation, and makes repeated revocation harmless', async () => {
    const owner = await user();
    const other = await user();
    const first = grant(await sessions.issue(owner.id));
    expect(await sessions.isActive(other.id, first.sessionId)).toBe(false);
    expect(await sessions.list(other.id)).toEqual([]);
    expect(await sessions.revoke(other.id, first.familyId)).toBe(false);
    expect(await sessions.isActive(owner.id, first.sessionId)).toBe(true);
    expect(await sessions.revoke(owner.id, first.familyId)).toBe(true);
    expect(await sessions.revoke(owner.id, first.familyId)).toBe(false);
    expect(await sessions.rotate(first.refreshToken)).toBeNull();
    expect(await sessions.isActive(owner.id, first.sessionId)).toBe(false);
  });

  it('revokes all families only for the named account', async () => {
    const owner = await user();
    const other = await user();
    const first = grant(await sessions.issue(owner.id));
    const second = grant(await sessions.issue(owner.id));
    const untouched = grant(await sessions.issue(other.id));
    await sessions.revokeAll(owner.id);
    expect(await sessions.rotate(first.refreshToken)).toBeNull();
    expect(await sessions.rotate(second.refreshToken)).toBeNull();
    expect(await sessions.isActive(other.id, untouched.sessionId)).toBe(true);
  });

  it('rejects setup-pending accounts and immediately denies existing grants after account-state changes', async () => {
    const pending = await user(true);
    expect(await sessions.issue(pending.id)).toBeNull();
    for (const status of ['locked', 'banned', 'deactivated']) {
      const account = await user();
      const first = grant(await sessions.issue(account.id));
      await db.query(
        "UPDATE core.users SET account_status = $1, state_reason = 'test', locked_until = clock_timestamp() + interval '1 minute' WHERE id = $2",
        [status, account.id],
      );
      expect(await sessions.issue(account.id)).toBeNull();
      expect(await sessions.rotate(first.refreshToken)).toBeNull();
      expect(await sessions.isActive(account.id, first.sessionId)).toBe(false);
    }
    const account = await user();
    const first = grant(await sessions.issue(account.id));
    await db.query('UPDATE core.users SET security_setup_required = true WHERE id = $1', [account.id]);
    expect(await sessions.rotate(first.refreshToken)).toBeNull();
    expect(await sessions.isActive(account.id, first.sessionId)).toBe(false);
  });

  it('fails expired grants using database time without renewing the lifetime', async () => {
    const account = await user();
    const short = createSessionRepository(runtime, 1);
    const first = grant(await short.issue(account.id));
    await db.query('SELECT pg_sleep(1.05)');
    expect(await short.rotate(first.refreshToken)).toBeNull();
    expect(await short.isActive(account.id, first.sessionId)).toBe(false);
    expect(await short.list(account.id)).toEqual([]);
  });

  it('checks expiry after waiting for the account lock, not at transaction start', async () => {
    const account = await user();
    const short = createSessionRepository(runtime, 1);
    const first = grant(await short.issue(account.id));
    const blocker = await db.pool.connect();
    let pending: Promise<SessionGrant | null> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM core.users WHERE id = $1 FOR UPDATE', [account.id]);
      pending = short.rotate(first.refreshToken);
      await blocker.query('SELECT pg_sleep(1.05)');
      await blocker.query('COMMIT');
      expect(await pending).toBeNull();
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await pending;
    }
  });

  it('rolls token consumption back if the successor insert fails, so a retry can succeed', async () => {
    const account = await user();
    const first = grant(await sessions.issue(account.id));
    await db.query('REVOKE INSERT ON core.sessions FROM boro_core');
    try {
      await expect(sessions.rotate(first.refreshToken)).rejects.toThrow(/permission denied/);
      const result = await db.query('SELECT consumed_at FROM core.sessions WHERE id = $1', [first.sessionId]);
      expect(result.rows).toEqual([{ consumed_at: null }]);
    } finally {
      await db.query('GRANT INSERT ON core.sessions TO boro_core');
    }
    expect(await sessions.rotate(first.refreshToken)).not.toBeNull();
  });

  it('revocation racing with refresh never leaves a usable successor', async () => {
    const account = await user();
    const first = grant(await sessions.issue(account.id));
    const [rotated] = await Promise.all([
      sessions.rotate(first.refreshToken),
      sessions.revoke(account.id, first.familyId),
    ]);
    if (rotated !== null) {
      expect(await sessions.isActive(account.id, rotated.sessionId)).toBe(false);
      expect(await sessions.rotate(rotated.refreshToken)).toBeNull();
    }
    expect(await sessions.list(account.id)).toEqual([]);
  });

  it('rejects malformed and unknown identifiers/secrets, without interpreting SQL input', async () => {
    expect(await sessions.issue("' OR true --")).toBeNull();
    expect(await sessions.issue('00000000-0000-7000-8000-000000000000')).toBeNull();
    expect(await sessions.rotate('invalid')).toBeNull();
    expect(await sessions.rotate('A'.repeat(43))).toBeNull();
    expect(await sessions.isActive('invalid', 'invalid')).toBe(false);
    expect(await sessions.list('invalid')).toEqual([]);
    expect(await sessions.revoke('invalid', 'invalid')).toBe(false);
    await sessions.revokeAll('invalid');
  });

  it('denies deletion of replay evidence to the runtime role', async () => {
    await expect(runtime.query('DELETE FROM core.sessions')).rejects.toThrow(/permission denied/);
    await expect(runtime.query('DELETE FROM core.session_families')).rejects.toThrow(/permission denied/);
  });

  it('reverses and reapplies the session migration without destroying identities', async () => {
    const account = await user();
    const migrationsDir = resolve('apps/api/migrations');
    expect(await migrateDown(db.pool, { schema: 'core', migrationsDir, steps: 8 })).toEqual([10, 9, 8, 7, 6, 5, 4, 3]);
    expect(await identities.findById(account.id)).not.toBeNull();
    expect((await migrateUp(db.pool, { schema: 'core', migrationsDir })).applied).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    expect(await sessions.issue(account.id)).not.toBeNull();
  });
});
