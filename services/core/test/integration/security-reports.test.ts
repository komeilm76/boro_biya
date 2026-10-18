import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createDb, initCluster, type Db } from '@boro-biya/db';
import { createDatabaseFor, injectedPgAdminUrl, type TestDatabaseHandle } from '@boro-biya/test-utils/pg';
import { makeCapturedLog, makeServerConfigFixture } from '@boro-biya/test-utils';
import { createLogger, createMetricsRegistry } from '@boro-biya/server-runtime';
import { buildApp } from '../../src/app.js';
import { createAuthService, type AuthService } from '../../src/auth/service.js';
import { readAuthConfig } from '../../src/auth/config.js';
import { readSecurityReports } from '../../src/security/reports.js';
import { verifyAuditIntegrity } from '../../src/audit/integrity.js';
const config = readAuthConfig({
  SESSION_SECRET: 'disposable-report-integration-material',
  WEB_ORIGIN: 'https://example.test',
  LOGIN_MAX_ATTEMPTS_PER_ACCOUNT: '2',
  LOGIN_MAX_ATTEMPTS_PER_ORIGIN: '3',
});
const report = {
  category: 'account_compromise',
  message: 'Synthetic private report for operator review.',
  locale: 'en',
};
let database: TestDatabaseHandle,
  db: Db,
  root: Db,
  auth: AuthService,
  app: FastifyInstance,
  runtimeUrl = '',
  headers: Record<string, string>;
const capture = makeCapturedLog(),
  password = 'Synthetic!orchard782';
beforeAll(async () => {
  database = await createDatabaseFor(injectedPgAdminUrl(), 'security_reports');
  await initCluster({
    adminConnectionString: database.adminConnectionString,
    passwords: { core: 'reports-only', relation: 'reports-only', sos: 'reports-only' },
    repoRoot: resolve('.'),
  });
  root = createDb({ connectionString: database.adminConnectionString });
  const url = new URL(database.adminConnectionString);
  url.username = 'boro_core';
  url.password = 'reports-only';
  runtimeUrl = url.toString();
  db = createDb({ connectionString: runtimeUrl });
  auth = await createAuthService(db, config);
  app = buildApp({
    config: makeServerConfigFixture(),
    registry: createMetricsRegistry(),
    logger: createLogger({ service: 'api', version: 'test', commit: 'test', level: 'info', sink: capture.sink }),
    auth,
  });
  const csrf = (await app.inject('/api/v1/auth/csrf')).json<{ csrfToken: string }>().csrfToken;
  headers = { origin: config.origin, cookie: `boro_csrf=${csrf}`, 'x-csrf-token': csrf };
});
beforeEach(async () => {
  await root.query('TRUNCATE core.security_reports,core.auth_buckets');
});
afterAll(async () => {
  await app?.close();
  await db?.close();
  await root?.close();
  await database?.drop();
});
const submit = (payload: unknown = report, ip = '192.0.2.4', custom = headers) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/security/reports',
    headers: { 'content-type': 'application/json', ...custom },
    payload: JSON.stringify(payload),
    remoteAddress: ip,
  });
describe('native anonymous operator intake and password confirmation quotas', () => {
  it('stores a signed-out report durably, audits metadata only and exposes no HTTP inbox', async () => {
    const response = await submit();
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: true });
    expect(response.headers['cache-control']).toBe('no-store');
    const restarted = createDb({ connectionString: runtimeUrl });
    try {
      expect((await readSecurityReports(restarted)).items[0]).toMatchObject(report);
    } finally {
      await restarted.close();
    }
    const audit = await root.pool.query<{ details: unknown }>(
      "SELECT details FROM core.audit_events WHERE action='security_report_received' ORDER BY chain_index DESC LIMIT 1",
    );
    expect(audit.rows[0]?.details).toEqual({});
    for (const method of ['GET', 'DELETE'] as const)
      expect((await app.inject({ method, url: '/api/v1/security/reports' })).statusCode).toBe(404);
    expect(capture.raw.join('')).not.toContain(report.message);
    expect(capture.raw.join('')).not.toContain('192.0.2.4');
    expect((await verifyAuditIntegrity(db)).version).toBe(1);
  });
  it('rejects hostile origins, missing CSRF, unknown fields, invalid UTF control and oversized bodies', async () => {
    for (const patch of [{ origin: 'https://evil.test' }, { cookie: '' }, { 'x-csrf-token': 'bad' }])
      expect((await submit(report, '192.0.2.4', { ...headers, ...patch })).statusCode).toBe(403);
    for (const patch of [
      { accountId: 'unknown' },
      { message: 'short' },
      { message: '😀'.repeat(10) },
      { message: report.message + '\u0000' },
      { message: 'x'.repeat(4001) },
    ])
      expect((await submit({ ...report, ...patch })).statusCode).toBe(400);
    expect((await submit({ ...report, message: 'x'.repeat(21000) })).statusCode).toBe(413);
    expect((await readSecurityReports(db)).items).toEqual([]);
  });
  it('persists the five-report origin quota across service restart with bounded retry metadata', async () => {
    for (let i = 0; i < 5; i++) expect((await submit()).statusCode).toBe(202);
    const restarted = await createAuthService(db, config);
    await expect(restarted.reports.submit(report, '192.0.2.4', 'quota')).rejects.toMatchObject({ statusCode: 429 });
    const denied = await submit();
    expect(denied.statusCode).toBe(429);
    expect(denied.headers['retry-after']).toBe(String(config.windowSeconds));
    expect((await readSecurityReports(db)).items).toHaveLength(5);
  });
  it('serializes concurrent reports so one origin cannot overshoot its quota', async () => {
    const responses = await Promise.all(Array.from({ length: 10 }, () => submit()));
    expect(responses.filter((response) => response.statusCode === 202)).toHaveLength(5);
    expect(responses.filter((response) => response.statusCode === 429)).toHaveLength(5);
    expect((await readSecurityReports(db)).items).toHaveLength(5);
  });
  it('enforces the global inbox bound independently of origin and recovers expired quotas', async () => {
    await auth.reports.submit(report, 'seed', 'seed');
    await root.query('UPDATE core.auth_buckets SET attempted_at=array_fill(clock_timestamp(),ARRAY[100])');
    expect((await submit(report, '192.0.2.99')).statusCode).toBe(429);
    await root.query("UPDATE core.auth_buckets SET attempted_at=ARRAY[clock_timestamp()-interval '2 hours']");
    expect((await submit(report, '192.0.2.99')).statusCode).toBe(202);
  });
  it('rolls report storage back when audit fails and denies runtime erasure or editing', async () => {
    await root.query(
      "ALTER TABLE core.audit_events ADD CONSTRAINT reject_report_fixture CHECK (action <> 'security_report_received') NOT VALID",
    );
    try {
      expect((await submit()).statusCode).toBe(500);
      expect((await readSecurityReports(db)).items).toEqual([]);
    } finally {
      await root.query('ALTER TABLE core.audit_events DROP CONSTRAINT reject_report_fixture');
    }
    expect((await submit()).statusCode).toBe(202);
    for (const sql of [
      'DELETE FROM core.security_reports',
      "UPDATE core.security_reports SET message='changed'",
      'TRUNCATE core.security_reports',
    ])
      await expect(db.query(sql)).rejects.toThrow(/permission denied/);
  });
  it('retrieves private reports through the actual operator CLI with nonoverlapping pagination', async () => {
    await root.query(
      "INSERT INTO core.security_reports(category,message,locale) SELECT 'abuse','Synthetic report for pagination only.','fa' FROM generate_series(1,51)",
    );
    const first = await readSecurityReports(db),
      second = await readSecurityReports(db, first.nextCursor!);
    expect(first.items).toHaveLength(50);
    expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(51);
    const cli = spawnSync(
      process.execPath,
      [resolve('scripts/security-reports.mjs'), `--before=${first.nextCursor!}`],
      { env: { ...process.env, DATABASE_URL: runtimeUrl }, encoding: 'utf8' },
    );
    expect(cli.status).toBe(0);
    expect(JSON.parse(cli.stdout)).toEqual(second);
    const bad = spawnSync(process.execPath, [resolve('scripts/security-reports.mjs'), '--before=invalid'], {
      env: { ...process.env, DATABASE_URL: runtimeUrl },
      encoding: 'utf8',
    });
    expect(bad.status).toBe(1);
    expect(bad.stdout).toBe('');
    expect(bad.stderr).not.toContain(runtimeUrl);
  });
  it('limits wrong current-password attempts across origins and service restart without changing credentials', async () => {
    const account = await auth.register(
      {
        username: 'quota_native',
        password,
        repeatPassword: password,
        answers: [1, 2, 3, 4, 5].map((questionId) => ({ questionId, answer: 'synthetic answer' })),
      },
      'register',
      'register',
    );
    const grant = await auth.login('quota_native', password, 'login', 'login');
    const change = (service: AuthService, current: string, ip: string) =>
      service.changePassword(
        account.id,
        grant.sessionId,
        current,
        'Another!violet782',
        'Another!violet782',
        'confirm',
        ip,
      );
    await expect(change(auth, 'wrong', '192.0.2.1')).rejects.toMatchObject({ statusCode: 401 });
    await expect(change(auth, 'wrong', '192.0.2.2')).rejects.toMatchObject({ statusCode: 401 });
    const restarted = await createAuthService(db, config);
    await expect(change(restarted, password, '192.0.2.3')).rejects.toMatchObject({ statusCode: 429 });
    expect((await auth.authenticate(`Bearer ${grant.accessToken}`)).userId).toBe(account.id);
    await root.query("UPDATE core.auth_buckets SET attempted_at=ARRAY[clock_timestamp()-interval '2 hours']");
    await expect(change(restarted, password, '192.0.2.3')).resolves.toBeUndefined();
    await expect(auth.authenticate(`Bearer ${grant.accessToken}`)).rejects.toMatchObject({ statusCode: 401 });
  });
  it('reverses and reapplies the application intake migration on a disposable database', async () => {
    await root.query(await readFile(resolve('services/core/migrations/0013_security_reports.down.sql'), 'utf8'));
    expect((await root.query("SELECT to_regclass('core.security_reports') AS table")).rows[0]).toEqual({ table: null });
    await root.query(await readFile(resolve('services/core/migrations/0013_security_reports.up.sql'), 'utf8'));
    expect((await submit()).statusCode).toBe(202);
  });
});
