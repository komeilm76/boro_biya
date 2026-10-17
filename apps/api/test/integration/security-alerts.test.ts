import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, initCluster, type Db } from '@boro-biya/db';
import { createDatabaseFor, injectedPgAdminUrl, type TestDatabaseHandle } from '@boro-biya/test-utils/pg';
import { createAuthService, type AuthService } from '../../src/auth/service.js';
import { readAuthConfig } from '../../src/auth/config.js';
import { readSecurityAlerts } from '../../src/audit/alerts.js';
import { verifyAuditIntegrity } from '../../src/audit/integrity.js';
let database: TestDatabaseHandle,
  db: Db,
  root: Db,
  auth: AuthService,
  runtimeUrl = '';
const config = readAuthConfig({
  SESSION_SECRET: 'disposable-security-alert-test-material',
  WEB_ORIGIN: 'https://example.test',
  LOGIN_MAX_ATTEMPTS_PER_ORIGIN: '1',
});
const password = 'Synthetic!orchard782';
beforeAll(async () => {
  database = await createDatabaseFor(injectedPgAdminUrl(), 'security_alerts');
  await initCluster({
    adminConnectionString: database.adminConnectionString,
    passwords: { core: 'alerts-only', relation: 'alerts-only', sos: 'alerts-only' },
    repoRoot: resolve('.'),
  });
  root = createDb({ connectionString: database.adminConnectionString });
  const url = new URL(database.adminConnectionString);
  url.username = 'boro_core';
  url.password = 'alerts-only';
  runtimeUrl = url.toString();
  db = createDb({ connectionString: runtimeUrl });
  auth = await createAuthService(db, config);
});
beforeEach(async () => {
  await root.query('TRUNCATE core.security_alerts,core.security_signal_state,core.auth_buckets,core.audit_events');
  await root.query("UPDATE core.audit_chain_head SET last_index=0,last_hash=repeat('0',64)");
});
afterAll(async () => {
  await db?.close();
  await root?.close();
  await database?.drop();
});
async function signal(action: string, request = 'signal') {
  await db.query(
    "INSERT INTO core.audit_events(actor_type,action,target_type,request_id) VALUES ('anonymous',$1,'user',$2)",
    [action, request],
  );
}
async function signals(action: string, count: number) {
  for (let i = 0; i < count; i++) await signal(action);
}
describe('triggered authentication and quota security alerts', () => {
  it.each([
    ['authentication_failure_rate', 'login_failed', 10],
    ['rate_limit_saturation', 'rate_limit_denied', 5],
    ['authorization_failure_rate', 'authorization_denied', 5],
  ] as const)(
    'raises %s only at the rolling threshold with minimal durable evidence',
    async (rule, action, threshold) => {
      await signals(action, threshold - 1);
      expect((await readSecurityAlerts(db)).items).toEqual([]);
      await signal(action);
      const result = await readSecurityAlerts(db);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({ rule, minimumSignals: threshold });
      expect(result.nextCursor).toBeNull();
      expect(Date.parse(result.items[0]!.createdAt)).toBeGreaterThan(Date.now() - 10000);
      expect(
        (await db.query("SELECT details FROM core.audit_events WHERE action='security_alert_raised'")).rows,
      ).toEqual([{ details: { rule, minimumSignals: threshold, windowSeconds: 300 } }]);
      expect((await verifyAuditIntegrity(db)).index).toBe(String(threshold + 1));
    },
  );
  it('triggers the authentication rule from real native-password login denials', async () => {
    for (let i = 0; i < 10; i++)
      await expect(auth.login(`absent_${i}`, password, `login-origin-${i}`, `login-${i}`)).rejects.toMatchObject({
        statusCode: 401,
      });
    expect((await readSecurityAlerts(db)).items).toMatchObject([
      { rule: 'authentication_failure_rate', minimumSignals: 10 },
    ]);
    expect(JSON.stringify(await readSecurityAlerts(db))).not.toContain(password);
  });
  it('triggers saturation from actual persisted quota denials across service restart', async () => {
    for (let i = 0; i < 5; i++) {
      const origin = `quota-origin-${i}`;
      await expect(auth.login(`absent_quota_${i}`, password, origin, 'first')).rejects.toMatchObject({
        statusCode: 401,
      });
      const restarted = await createAuthService(db, config);
      await expect(restarted.login(`absent_quota_${i}`, password, origin, 'quota')).rejects.toMatchObject({
        statusCode: 429,
      });
    }
    expect((await readSecurityAlerts(db)).items).toMatchObject([{ rule: 'rate_limit_saturation', minimumSignals: 5 }]);
    await verifyAuditIntegrity(db);
  });
  it('triggers repeated authorization failures from actual ordinary-user administrative denials', async () => {
    const account = await auth.register(
      {
        username: 'alert_user',
        password,
        repeatPassword: password,
        answers: [1, 2, 3, 4, 5].map((questionId) => ({ questionId, answer: 'synthetic private answer' })),
      },
      'register-origin',
      'register',
    );
    const session = await auth.login('alert_user', password, 'authorized-login-origin', 'login');
    for (let i = 0; i < 5; i++)
      await expect(
        auth.administration.users({ userId: account.id, sessionId: session.sessionId }, 'denied'),
      ).rejects.toMatchObject({ statusCode: 403 });
    expect((await readSecurityAlerts(db)).items).toMatchObject([
      { rule: 'authorization_failure_rate', minimumSignals: 5 },
    ]);
    await verifyAuditIntegrity(db);
  });
  it('serializes concurrent threshold crossings and suppresses duplicates during cooldown', async () => {
    await Promise.all(Array.from({ length: 25 }, () => signal('rate_limit_denied')));
    expect((await readSecurityAlerts(db)).items).toHaveLength(1);
    await root.query("UPDATE core.security_signal_state SET next_alert_at=clock_timestamp()-interval '1 second'");
    await signal('rate_limit_denied');
    expect((await readSecurityAlerts(db)).items).toHaveLength(2);
    await verifyAuditIntegrity(db);
  });
  it('prunes expired signal timestamps, ignores unrelated audit events and bounds each bucket', async () => {
    await signals('other_event', 10);
    expect((await root.query('SELECT * FROM core.security_signal_state')).rows).toHaveLength(0);
    await signals('rate_limit_denied', 4);
    await root.query(
      "UPDATE core.security_signal_state SET attempted_at=ARRAY[clock_timestamp()-interval '301 seconds']",
    );
    await signal('rate_limit_denied');
    expect((await readSecurityAlerts(db)).items).toHaveLength(0);
    await signals('rate_limit_denied', 20);
    expect((await readSecurityAlerts(db)).items).toHaveLength(1);
    expect(
      (await root.query('SELECT cardinality(attempted_at) AS count FROM core.security_signal_state')).rows,
    ).toEqual([{ count: 5 }]);
  });
  it('uses observed database time, never a caller-supplied event time, for the signal window', async () => {
    await db.query(
      "INSERT INTO core.audit_events(actor_type,action,target_type,request_id,created_at) SELECT 'anonymous','rate_limit_denied','user','backdated',clock_timestamp()-interval '1 year' FROM generate_series(1,5)",
    );
    expect((await readSecurityAlerts(db)).items).toHaveLength(1);
    expect(Date.parse((await readSecurityAlerts(db)).items[0]!.createdAt)).toBeGreaterThan(Date.now() - 10000);
    await verifyAuditIntegrity(db);
  });
  it('delivers a bounded PostgreSQL wake-up after commit and keeps the alert available for reconnect', async () => {
    const listener = await db.pool.connect();
    try {
      await listener.query('LISTEN boro_security_alerts_v1');
      const received = once(listener, 'notification', { signal: AbortSignal.timeout(5000) });
      await signals('rate_limit_denied', 5);
      const event: unknown = (await received)[0];
      if (!event || typeof event !== 'object' || !('payload' in event) || typeof event.payload !== 'string')
        throw new Error('missing signal');
      const durable = (await readSecurityAlerts(db)).items[0]!;
      expect(JSON.parse(event.payload)).toEqual({ id: durable.id, rule: durable.rule });
      expect(event.payload.length).toBeLessThan(150);
      await listener.query('UNLISTEN boro_security_alerts_v1');
      expect((await readSecurityAlerts(db)).items[0]!.id).toBe(durable.id);
    } finally {
      listener.release();
    }
  });
  it('rolls the source signal, alert, head and counter back if the alert audit fails', async () => {
    await signals('rate_limit_denied', 4);
    const checkpoint = await verifyAuditIntegrity(db);
    await root.query(
      "ALTER TABLE core.audit_events ADD CONSTRAINT disposable_alert_failure CHECK (action <> 'security_alert_raised') NOT VALID",
    );
    try {
      await expect(signal('rate_limit_denied')).rejects.toThrow(/check constraint/);
    } finally {
      await root.query('ALTER TABLE core.audit_events DROP CONSTRAINT disposable_alert_failure');
    }
    expect((await readSecurityAlerts(db)).items).toHaveLength(0);
    expect(await verifyAuditIntegrity(db, checkpoint)).toEqual(checkpoint);
    expect(
      (await root.query('SELECT cardinality(attempted_at) AS count FROM core.security_signal_state')).rows,
    ).toEqual([{ count: 4 }]);
    await signal('rate_limit_denied');
    expect((await readSecurityAlerts(db)).items).toHaveLength(1);
  });
  it('denies runtime modification of rules, counters, records and detection trigger', async () => {
    await signals('rate_limit_denied', 5);
    for (const sql of [
      'DELETE FROM core.security_alerts',
      'TRUNCATE core.security_alerts',
      'UPDATE core.security_alerts SET minimum_signals=1',
      'DELETE FROM core.security_signal_state',
      'UPDATE core.security_alert_rules SET threshold=1',
      "INSERT INTO core.security_alert_rules VALUES ('forged','forged',1,1,1)",
      'ALTER TABLE core.audit_events DISABLE TRIGGER security_alert_detection',
    ])
      await expect(db.query(sql)).rejects.toThrow(/permission denied|must be owner/);
    expect((await readSecurityAlerts(db)).items).toHaveLength(1);
  });
  it('paginates 50-item durable reads without overlap and the actual CLI exposes no credential data', async () => {
    for (let i = 0; i < 51; i++) {
      await signals('rate_limit_denied', 5);
      await root.query("UPDATE core.security_signal_state SET next_alert_at='-infinity'");
    }
    const first = await readSecurityAlerts(db);
    expect(first.items).toHaveLength(50);
    const second = await readSecurityAlerts(db, first.nextCursor!);
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(51);
    const cli = spawnSync(process.execPath, [resolve('scripts/security-alerts.mjs'), `--before=${first.nextCursor!}`], {
      env: { ...process.env, DATABASE_URL: runtimeUrl },
      encoding: 'utf8',
    });
    expect(cli.status).toBe(0);
    expect(JSON.parse(cli.stdout)).toEqual(second);
    expect(cli.stdout).not.toContain(password);
    const bad = spawnSync(process.execPath, [resolve('scripts/security-alerts.mjs'), '--before=invalid'], {
      env: { ...process.env, DATABASE_URL: runtimeUrl },
      encoding: 'utf8',
    });
    expect(bad.status).toBe(1);
    expect(bad.stdout).toBe('');
    expect(bad.stderr).not.toContain(runtimeUrl);
  });
});
