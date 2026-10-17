import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, initCluster, migrateDown, migrateUp, type Db } from '@boro-biya/db';
import { createDatabaseFor, injectedPgAdminUrl, type TestDatabaseHandle } from '@boro-biya/test-utils/pg';
import { createIdentityRepository } from '../../src/identity/repository.js';

// Deliberately not a real credential: this fixture tests persistence, not password hashing.
const HASH_FIXTURE = '$argon2id$v=19$m=65536,t=2,p=1$fixture$not-a-real-credential';
const migrationsDir = resolve('apps/api/migrations');
let database: TestDatabaseHandle;
let db: Db;
let runtime: Db;
let repository: ReturnType<typeof createIdentityRepository>;

beforeAll(async () => {
  database = await createDatabaseFor(injectedPgAdminUrl(), 'identity');
  await initCluster({
    adminConnectionString: database.adminConnectionString,
    passwords: { core: 'identity-test-only', relation: 'identity-test-only', sos: 'identity-test-only' },
    repoRoot: resolve('.'),
  });
  db = createDb({ connectionString: database.adminConnectionString });
  const url = new URL(database.adminConnectionString);
  url.username = 'boro_core';
  url.password = 'identity-test-only';
  runtime = createDb({ connectionString: url.toString() });
  repository = createIdentityRepository(runtime);
});

afterAll(async () => {
  await runtime?.close();
  await db?.close();
  await database?.drop();
});

function identity(username: string) {
  return { username, passwordHash: HASH_FIXTURE, passwordSetupRequired: true, securitySetupRequired: true };
}

describe('identity persistence against PostgreSQL 18 (AUTH-09, AUTH-27, ADM-06, QA-15)', () => {
  it('seeds exactly two roles, and creates a UUIDv7 identity with only the user role atomically', async () => {
    const roles = await runtime.query('SELECT key FROM core.roles ORDER BY key');
    expect(roles.rows).toEqual([{ key: 'admin' }, { key: 'user' }]);
    const account = await repository.create(identity('  Ａlice  '));
    expect(account).toEqual({
      id: account.id,
      username: 'Alice',
      status: 'active',
      passwordSetupRequired: true,
      securitySetupRequired: true,
    });
    expect(account.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await repository.findById(account.id)).toEqual(account);
    expect(JSON.stringify(account)).not.toContain('argon2');
    const stored = await db.query(
      'SELECT username_normalized, username_normalization_version, password_hash FROM core.users WHERE id = $1',
      [account.id],
    );
    expect(stored.rows).toEqual([
      { username_normalized: 'alice', username_normalization_version: 1, password_hash: HASH_FIXTURE },
    ]);
    const assigned = await runtime.query(
      'SELECT r.key FROM core.roles r JOIN core.user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1',
      [account.id],
    );
    expect(assigned.rows).toEqual([{ key: 'user' }]);
  });

  it('enforces normalized uniqueness under concurrent creates with no orphan role assignment', async () => {
    const results = await Promise.allSettled([
      repository.create(identity('BOB')),
      repository.create(identity('ｂｏｂ')),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const counts = await runtime.query(
      "SELECT count(*)::integer AS total FROM core.user_roles ur JOIN core.users u ON u.id = ur.user_id WHERE u.username_normalized = 'bob'",
    );
    expect(counts.rows).toEqual([{ total: 1 }]);
  });

  it('rolls back account creation if the required default role cannot be assigned', async () => {
    await db.query("UPDATE core.roles SET key = 'temporarily_unavailable' WHERE key = 'user'");
    try {
      await expect(repository.create(identity('rollback-user'))).rejects.toThrow('default role unavailable');
      const result = await runtime.query("SELECT id FROM core.users WHERE username_normalized = 'rollback-user'");
      expect(result.rows).toEqual([]);
    } finally {
      await db.query("UPDATE core.roles SET key = 'user' WHERE key = 'temporarily_unavailable'");
    }
  });

  it('keeps identity data on deactivation and denies DELETE to the runtime role', async () => {
    const account = await repository.create(identity('retained-user'));
    await runtime.query("UPDATE core.users SET account_status = 'deactivated', state_reason = $1 WHERE id = $2", [
      'test lifecycle',
      account.id,
    ]);
    expect((await repository.findById(account.id))?.status).toBe('deactivated');
    await expect(runtime.query('DELETE FROM core.users WHERE id = $1', [account.id])).rejects.toThrow(
      /permission denied/,
    );
    expect(await repository.findById(account.id)).not.toBeNull();
  });

  it('rejects invalid states, unbounded lockouts, missing state reasons and raw passwords', async () => {
    const account = await repository.create(identity('state-user'));
    await expect(
      runtime.query("UPDATE core.users SET account_status = 'other' WHERE id = $1", [account.id]),
    ).rejects.toThrow(/check constraint/);
    await expect(
      runtime.query("UPDATE core.users SET account_status = 'locked' WHERE id = $1", [account.id]),
    ).rejects.toThrow(/check constraint/);
    await expect(
      runtime.query("UPDATE core.users SET account_status = 'banned' WHERE id = $1", [account.id]),
    ).rejects.toThrow(/check constraint/);
    await expect(
      runtime.query('UPDATE core.users SET password_hash = $1 WHERE id = $2', ['not-a-hash', account.id]),
    ).rejects.toThrow(/check constraint/);
    await expect(repository.create({ ...identity('raw-password'), passwordHash: 'not-a-hash' })).rejects.toThrow(
      'expected encoded Argon2id hash',
    );
  });

  it('exposes no contact columns and returns null for unknown or malformed identifiers', async () => {
    const columns = await runtime.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'core' AND table_name = 'users'",
    );
    expect(columns.rows.map((row) => row['column_name'] as unknown)).not.toEqual(expect.arrayContaining(['email']));
    expect(columns.rows.map((row) => row['column_name'] as unknown)).not.toEqual(expect.arrayContaining(['phone']));
    expect(await repository.findById('invalid')).toBeNull();
    expect(await repository.findById('00000000-0000-7000-8000-000000000000')).toBeNull();
  });

  it('reverses and reapplies the Phase 2 migrations without changing the existing runner', async () => {
    expect(await migrateDown(db.pool, { schema: 'core', migrationsDir, steps: 8 })).toEqual([9, 8, 7, 6, 5, 4, 3, 2]);
    expect((await db.query("SELECT to_regclass('core.users') AS relation")).rows).toEqual([{ relation: null }]);
    expect((await migrateUp(db.pool, { schema: 'core', migrationsDir })).applied).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect((await runtime.query('SELECT key FROM core.roles ORDER BY key')).rows).toEqual([
      { key: 'admin' },
      { key: 'user' },
    ]);
    expect((await repository.create(identity('after-rollback'))).username).toBe('after-rollback');
  });
});
