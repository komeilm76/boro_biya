import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createDb, initCluster, type Db } from '@boro-biya/db';
import { createDatabaseFor, injectedPgAdminUrl, type TestDatabaseHandle } from '@boro-biya/test-utils/pg';
import { makeCapturedLog, makeServerConfigFixture } from '@boro-biya/test-utils';
import { createLogger, createMetricsRegistry } from '@boro-biya/server-runtime';
import { privacyPolicySchema } from '@boro-biya/validation';
import { buildApp } from '../../src/app.js';
import { createAuthService, type AuthService } from '../../src/auth/service.js';
import { readAuthConfig } from '../../src/auth/config.js';
import { runRetentionPass } from '../../src/privacy/retention.js';
const env = {
  SESSION_SECRET: 'disposable-retention-native-material',
  WEB_ORIGIN: 'https://example.test',
  ACCESS_TOKEN_TTL_SECONDS: '120',
  REFRESH_TOKEN_TTL_DAYS: '7',
  LOGIN_WINDOW_SECONDS: '600',
  RECOVERY_CHALLENGE_TTL_SECONDS: '120',
  RECOVERY_GRANT_TTL_SECONDS: '180',
  AUDIT_LOG_RETENTION_DAYS: '365',
  OPERATIONAL_RECORD_RETENTION_DAYS: '30',
};
const config = readAuthConfig(env);
const enabled = readAuthConfig({
  ...env,
  RETENTION_AUTOMATED_DELETION_ENABLED: 'true',
  CAPTCHA_ENABLED: 'true',
  CAPTCHA_TOKEN_SECRET: 'disposable-retention-token-material',
});
let database: TestDatabaseHandle,
  root: Db,
  db: Db,
  auth: AuthService,
  app: FastifyInstance,
  runtimeUrl = '',
  target = '',
  operator = '';
let grant: Awaited<ReturnType<AuthService['login']>>;
const password = 'Synthetic!orchard782';
beforeAll(async () => {
  database = await createDatabaseFor(injectedPgAdminUrl(), 'retention');
  await initCluster({
    adminConnectionString: database.adminConnectionString,
    passwords: { core: 'retention-only', relation: 'retention-only', sos: 'retention-only' },
    repoRoot: resolve('.'),
  });
  root = createDb({ connectionString: database.adminConnectionString });
  const url = new URL(database.adminConnectionString);
  url.username = 'boro_core';
  url.password = 'retention-only';
  runtimeUrl = url.toString();
  db = createDb({ connectionString: runtimeUrl });
  auth = await createAuthService(db, config);
  for (const username of ['retention_operator', 'retention_target']) {
    const created = await auth.register(
      {
        username,
        password,
        repeatPassword: password,
        answers: [1, 2, 3, 4, 5].map((questionId) => ({ questionId, answer: 'private invented answer' })),
      },
      'fixture',
      'fixture',
    );
    if (username === 'retention_operator') operator = created.id;
    else target = created.id;
  }
  await root.query("INSERT INTO core.user_roles(user_id,role_id) SELECT $1,id FROM core.roles WHERE key='admin'", [
    operator,
  ]);
  grant = await auth.login('retention_operator', password, 'fixture', 'login');
  await auth.login('retention_target', password, 'fixture', 'login');
  await auth.recovery.forgot('retention_target', 'fixture', 'recovery');
  await root.query(
    "INSERT INTO core.account_setup_flows(token_hash,user_id,credential_fingerprint,created_at,expires_at) VALUES (repeat('b',64),$1,'synthetic',clock_timestamp()-interval '20 minutes',clock_timestamp()-interval '10 minutes')",
    [target],
  );
  await root.query(
    "INSERT INTO core.notifications(recipient_id,event_type,expires_at) VALUES ($1,'password_changed',clock_timestamp()-interval '1 day')",
    [target],
  );
  await root.query(
    "INSERT INTO core.audit_events(actor_type,action,target_type,request_id) SELECT 'system','rate_limit_denied','retention','fixture' FROM generate_series(1,5)",
  );
  app = buildApp({
    config: makeServerConfigFixture(),
    auth,
    registry: createMetricsRegistry(),
    logger: createLogger({
      service: 'api',
      version: 'test',
      commit: 'test',
      level: 'debug',
      sink: makeCapturedLog().sink,
    }),
  });
  await seed(105);
});
afterAll(async () => {
  await app?.close();
  await db?.close();
  await root?.close();
  await database?.drop();
});
async function seed(count: number) {
  await root.query('TRUNCATE core.captcha_challenges');
  await root.query(
    "INSERT INTO core.captcha_challenges(token_hash,origin_hash,purpose,work_bits,created_at,expires_at) SELECT encode(sha256(convert_to(i::text,'UTF8')),'hex'),repeat('a',64),'login',12,clock_timestamp()-interval '20 minutes',clock_timestamp()-interval '10 minutes' FROM generate_series(1,$1::int) i",
    [count],
  );
  await root.query(
    "INSERT INTO core.captcha_challenges(token_hash,origin_hash,purpose,work_bits,expires_at) VALUES (repeat('c',64),repeat('a',64),'login',12,clock_timestamp()+interval '5 minutes')",
  );
}
async function counts() {
  const tables = await root.pool.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname='core' ORDER BY tablename",
  );
  const result: Record<string, number> = {};
  for (const { tablename } of tables.rows) {
    if (!/^[a-z_]+$/.test(tablename)) throw new Error('fixture identifier');
    result[tablename] = (
      await root.pool.query<{ count: number }>(`SELECT count(*)::integer AS count FROM core."${tablename}"`)
    ).rows[0]!.count;
  }
  return result;
}
async function recordKeys() {
  const tables = await root.pool.query<{ table_name: string; columns: string[] }>(
    "SELECT t.table_name,array_agg(k.column_name::text ORDER BY k.ordinal_position) AS columns FROM information_schema.table_constraints t JOIN information_schema.key_column_usage k ON k.constraint_schema=t.constraint_schema AND k.constraint_name=t.constraint_name AND k.table_name=t.table_name WHERE t.table_schema='core' AND t.constraint_type='PRIMARY KEY' GROUP BY t.table_name",
  );
  const result: Record<string, string[]> = {};
  for (const table of tables.rows) {
    for (const name of [table.table_name, ...table.columns])
      if (!/^[a-z_]+$/.test(name)) throw new Error('fixture identifier');
    const selected = table.columns.map((name) => `"${name}"`).join(',');
    result[table.table_name] = (
      await root.pool.query<{ key: unknown }>(
        `SELECT jsonb_build_array(${selected}) AS key FROM core."${table.table_name}"`,
      )
    ).rows.map((row) => JSON.stringify(row.key));
  }
  return result;
}
describe('effective development policy and default-off retention acceptance', () => {
  it('publishes actual nondefault runtime values without secrets or candidate-enforcement claims', async () => {
    const response = await app.inject('/api/v1/privacy/policy');
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const policy = privacyPolicySchema.parse(response.json());
    expect(policy).toMatchObject({
      accessTtlSeconds: 120,
      refreshTtlSeconds: 604800,
      loginWindowSeconds: 600,
      recoveryChallengeTtlSeconds: 120,
      recoveryGrantTtlSeconds: 180,
      auditDaysCandidate: 365,
      operationalDaysCandidate: 30,
      automaticAccountDeletion: false,
      automatedDeletionRequested: false,
      recordRetentionEnforced: false,
      challengeCleanupEnabled: false,
    });
    expect(response.body).not.toContain(env.SESSION_SECRET);
    expect(response.body).not.toContain(runtimeUrl);
  });
  it('retention maintenance with enforcement off changes no core table row count, including expired records', async () => {
    const before = await counts();
    expect(await runRetentionPass(db, config)).toEqual({ challengeCleanupEnabled: false, deletedChallenges: 0 });
    expect(await counts()).toEqual(before);
    expect(before['captcha_challenges']).toBe(106);
  });
  it('actual disabled CLI entry changes no row count and has no force-override argument', async () => {
    const before = await counts();
    const cli = spawnSync(process.execPath, [resolve('scripts/retention-pass.mjs')], {
      encoding: 'utf8',
      env: {
        ...process.env,
        ...env,
        DATABASE_URL: runtimeUrl,
        RETENTION_AUTOMATED_DELETION_ENABLED: 'false',
        CAPTCHA_ENABLED: 'false',
      },
    });
    expect(cli.status).toBe(0);
    expect(JSON.parse(cli.stdout)).toEqual({ challengeCleanupEnabled: false, deletedChallenges: 0 });
    expect(await counts()).toEqual(before);
    const bad = spawnSync(process.execPath, [resolve('scripts/retention-pass.mjs'), '--force'], {
      encoding: 'utf8',
      env: { ...process.env, ...env, DATABASE_URL: runtimeUrl },
    });
    expect(bad.status).toBe(1);
    expect(bad.stdout).toBe('');
    expect(bad.stderr).not.toContain(runtimeUrl);
  });
  it('opt-in pass deletes at most 100 grace-past challenges, keeps live challenges and audits only a count', async () => {
    const before = await counts();
    expect(await runRetentionPass(db, enabled)).toEqual({ challengeCleanupEnabled: true, deletedChallenges: 100 });
    expect((await counts())['captcha_challenges']).toBe(6);
    expect(
      (await db.query("SELECT token_hash FROM core.captcha_challenges WHERE token_hash=repeat('c',64)")).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("SELECT details FROM core.audit_events WHERE action='retention_challenges_pruned'")).rows,
    ).toEqual([{ details: { count: 100 } }]);
    const after = await counts();
    for (const [table, count] of Object.entries(before))
      if (table !== 'captcha_challenges') expect(after[table]).toBeGreaterThanOrEqual(count);
  });
  it('rolls deleted challenges back if the cleanup summary audit fails', async () => {
    await seed(10);
    await root.query(
      "ALTER TABLE core.audit_events ADD CONSTRAINT retention_failure CHECK (action <> 'retention_challenges_pruned') NOT VALID",
    );
    const before = await counts();
    try {
      await expect(runRetentionPass(db, enabled)).rejects.toThrow(/check constraint/);
    } finally {
      await root.query('ALTER TABLE core.audit_events DROP CONSTRAINT retention_failure');
    }
    expect(await counts()).toEqual(before);
  });
  it('deactivation preserves related records and credential hashes while invalidating access, not erasing data', async () => {
    const before = await counts();
    const keysBefore = await recordKeys();
    const answers = (
      await db.query('SELECT * FROM core.user_security_answers WHERE user_id=$1 ORDER BY question_id', [target])
    ).rows;
    const user = (await db.query('SELECT password_hash FROM core.users WHERE id=$1', [target])).rows;
    await auth.administration.state(
      { userId: operator, sessionId: grant.sessionId },
      target,
      'deactivate',
      'requested lifecycle change',
      password,
      'fixture',
      'deactivate',
    );
    const after = await counts();
    for (const [table, count] of Object.entries(before)) expect(after[table], table).toBeGreaterThanOrEqual(count);
    const keysAfter = await recordKeys();
    for (const [table, keys] of Object.entries(keysBefore))
      for (const key of keys) expect(keysAfter[table], table).toContain(key);
    expect(
      (await db.query('SELECT * FROM core.user_security_answers WHERE user_id=$1 ORDER BY question_id', [target])).rows,
    ).toEqual(answers);
    expect((await db.query('SELECT password_hash FROM core.users WHERE id=$1', [target])).rows).toEqual(user);
    expect((await db.query('SELECT account_status FROM core.users WHERE id=$1', [target])).rows).toEqual([
      { account_status: 'deactivated' },
    ]);
    await expect(auth.login('retention_target', password, 'fixture', 'denied')).rejects.toMatchObject({
      statusCode: 401,
    });
  });
  it('has no account-deletion HTTP path even for a genuine administrator, and runtime SQL cannot erase identity records', async () => {
    for (const path of [`/api/v1/admin/users/${target}`, `/api/v1/users/${target}`, '/api/v1/users/me'])
      expect(
        (await app.inject({ method: 'DELETE', url: path, headers: { authorization: `Bearer ${grant.accessToken}` } }))
          .statusCode,
      ).toBe(404);
    for (const table of [
      'users',
      'session_families',
      'sessions',
      'password_reset_challenges',
      'account_setup_flows',
      'notifications',
      'audit_events',
    ])
      await expect(db.query(`DELETE FROM core.${table}`)).rejects.toThrow(/permission denied/);
  });
});
