import { resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, initCluster, migrateDown, migrateUp, type Db } from '@boro-biya/db';
import { createDatabaseFor, injectedPgAdminUrl, type TestDatabaseHandle } from '@boro-biya/test-utils/pg';
import { verifyAuditIntegrity, type AuditCheckpoint } from '../../src/audit/integrity.js';
let database: TestDatabaseHandle, db: Db, root: Db;
let runtimeUrl = '';
const migrationsDir = resolve('apps/api/migrations');
beforeAll(async () => {
  database = await createDatabaseFor(injectedPgAdminUrl(), 'audit_integrity');
  await initCluster({
    adminConnectionString: database.adminConnectionString,
    passwords: { core: 'audit-only', relation: 'audit-only', sos: 'audit-only' },
    repoRoot: resolve('.'),
  });
  root = createDb({ connectionString: database.adminConnectionString });
  const url = new URL(database.adminConnectionString);
  url.username = 'boro_core';
  url.password = 'audit-only';
  runtimeUrl = url.toString();
  db = createDb({ connectionString: runtimeUrl });
});
beforeEach(async () => {
  await root.query('TRUNCATE core.audit_events');
  await root.query("UPDATE core.audit_chain_head SET last_index=0,last_hash=repeat('0',64)");
});
afterAll(async () => {
  await db?.close();
  await root?.close();
  await database?.drop();
});
async function append(action = 'test_event') {
  await db.query(
    "INSERT INTO core.audit_events(actor_type,action,target_type,request_id,details) VALUES ('system',$1,'audit','integrity-test',$2)",
    [action, { source: 'synthetic 漢字 فارسی', count: 1 }],
  );
}
function cli(anchor?: string) {
  return spawnSync(
    process.execPath,
    [resolve('scripts/verify-audit.mjs'), ...(anchor ? [`--checkpoint=${anchor}`] : [])],
    { cwd: resolve('.'), env: { ...process.env, DATABASE_URL: runtimeUrl }, encoding: 'utf8' },
  );
}
describe('application audit hash chain and independent checkpoints', () => {
  it('verifies an empty chain and chains all canonical fields with precise UTC and Unicode payloads', async () => {
    expect(await verifyAuditIntegrity(db)).toEqual({ version: 1, index: '0', hash: '0'.repeat(64) });
    await append();
    await append('next');
    const checkpoint = await verifyAuditIntegrity(db);
    expect(checkpoint.index).toBe('2');
    const rows = await db.query(
      'SELECT chain_index,previous_hash,event_hash,core.audit_payload(e) AS payload FROM core.audit_events e ORDER BY chain_index',
    );
    expect(rows.rows[0]!['previous_hash']).toBe('0'.repeat(64));
    expect(rows.rows[1]!['previous_hash']).toBe(rows.rows[0]!['event_hash']);
    const client = await db.pool.connect();
    try {
      await client.query("SET TIME ZONE 'Asia/Tehran'");
    } finally {
      client.release();
    }
    expect(await verifyAuditIntegrity(db, checkpoint)).toEqual(checkpoint);
  });
  it('overwrites caller-supplied chain fields and denies mutation, truncation, head writes and trigger disabling to runtime', async () => {
    await db.query(
      "INSERT INTO core.audit_events(actor_type,action,target_type,request_id,chain_index,previous_hash,event_hash) VALUES ('system','forged','audit','request',999,repeat('a',64),repeat('b',64))",
    );
    expect((await verifyAuditIntegrity(db)).index).toBe('1');
    for (const sql of [
      "UPDATE core.audit_events SET action='changed'",
      'DELETE FROM core.audit_events',
      'TRUNCATE core.audit_events',
      "UPDATE core.audit_chain_head SET last_index=0,last_hash=repeat('0',64)",
      'DELETE FROM core.audit_chain_head',
      'TRUNCATE core.audit_chain_head',
      'ALTER TABLE core.audit_events DISABLE TRIGGER audit_integrity',
    ])
      await expect(db.query(sql)).rejects.toThrow(/permission denied|must be owner/);
    expect((await verifyAuditIntegrity(db)).index).toBe('1');
  });
  it('serializes concurrent appends into one contiguous chain', async () => {
    await Promise.all(Array.from({ length: 30 }, (_, i) => append(`parallel_${i}`)));
    expect((await verifyAuditIntegrity(db)).index).toBe('30');
    const rows = await db.query(
      'SELECT min(chain_index)::text AS first,max(chain_index)::text AS last,count(*)::text AS count FROM core.audit_events',
    );
    expect(rows.rows).toEqual([{ first: '1', last: '30', count: '30' }]);
  });
  it('rolls back the head together with rejected audit inserts and rolled-back business transactions', async () => {
    await append();
    const checkpoint = await verifyAuditIntegrity(db);
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        "INSERT INTO core.audit_events(actor_type,action,target_type,request_id) VALUES ('system','rolled_back','audit','rollback')",
      );
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    await root.query("ALTER TABLE core.audit_events ADD CONSTRAINT disposable_reject CHECK (action <> 'rejected')");
    try {
      await expect(append('rejected')).rejects.toThrow(/check constraint/);
    } finally {
      await root.query('ALTER TABLE core.audit_events DROP CONSTRAINT disposable_reject');
    }
    expect(await verifyAuditIntegrity(db, checkpoint)).toEqual(checkpoint);
    await append();
    expect((await verifyAuditIntegrity(db)).index).toBe('2');
  });
  it.each([
    'id',
    'target_id',
    'chain_index',
    'action',
    'actor_type',
    'target_type',
    'request_id',
    'details',
    'created_at',
  ] as const)('detects privileged mutation of the hashed %s field', async (field) => {
    await append();
    const changes = {
      id: 'uuidv7()',
      target_id: 'uuidv7()',
      chain_index: 'chain_index + 1',
      action: "'tampered'",
      actor_type: "'anonymous'",
      target_type: "'other'",
      request_id: "'different'",
      details: '\'{"changed":true}\'::jsonb',
      created_at: "created_at + interval '1 microsecond'",
    };
    // Fixed test-only identifiers/expressions; no request data enters SQL text.
    await root.query(`UPDATE core.audit_events SET ${field}=${changes[field]}`);
    await expect(verifyAuditIntegrity(db)).rejects.toThrow('audit integrity mismatch');
  });
  it.each(['previous_hash', 'event_hash'] as const)('detects a modified %s', async (field) => {
    await append();
    await root.query(`UPDATE core.audit_events SET ${field}=repeat('c',64)`);
    await expect(verifyAuditIntegrity(db)).rejects.toThrow('audit integrity mismatch');
  });
  it.each(['1', '2'] as const)('detects missing chain record %s', async (index) => {
    await append();
    await append();
    await root.query('DELETE FROM core.audit_events WHERE chain_index=$1', [index]);
    await expect(verifyAuditIntegrity(db)).rejects.toThrow('audit integrity mismatch');
  });
  it('detects records beyond a forged empty head and a missing head', async () => {
    await append();
    await root.query("UPDATE core.audit_chain_head SET last_index=0,last_hash=repeat('0',64)");
    await expect(verifyAuditIntegrity(db)).rejects.toThrow('audit integrity mismatch');
    await root.query('DELETE FROM core.audit_chain_head');
    await expect(verifyAuditIntegrity(db)).rejects.toThrow('audit integrity mismatch');
    await expect(append()).rejects.toThrow('audit chain unavailable');
    await root.query("INSERT INTO core.audit_chain_head VALUES (true,0,repeat('0',64))");
  });
  it('uses an independently held checkpoint to detect otherwise-consistent privileged tail removal', async () => {
    await append();
    await append();
    const anchor = await verifyAuditIntegrity(db);
    const first = await db.query('SELECT event_hash FROM core.audit_events WHERE chain_index=1');
    await root.query('DELETE FROM core.audit_events WHERE chain_index=2');
    await root.query('UPDATE core.audit_chain_head SET last_index=1,last_hash=$1', [first.rows[0]!['event_hash']]);
    expect((await verifyAuditIntegrity(db)).index).toBe('1');
    await expect(verifyAuditIntegrity(db, anchor)).rejects.toThrow('audit integrity mismatch');
  });
  it('backfills existing history on migration and detects rewritten history against its earlier independent checkpoint', async () => {
    await append();
    const anchor = await verifyAuditIntegrity(db);
    expect(await migrateDown(root.pool, { schema: 'core', migrationsDir, steps: 1 })).toEqual([11]);
    await root.query("UPDATE core.audit_events SET action='privileged_history_rewrite'");
    await append('before_backfill');
    expect((await migrateUp(root.pool, { schema: 'core', migrationsDir })).applied).toEqual([11]);
    expect((await verifyAuditIntegrity(db)).index).toBe('2');
    await expect(verifyAuditIntegrity(db, anchor)).rejects.toThrow('audit integrity mismatch');
    await append('after_backfill');
    expect((await verifyAuditIntegrity(db)).index).toBe('3');
  });
  it('verifies a stable snapshot during concurrent append and crosses bounded 250-row page boundaries', async () => {
    await db.query(
      "INSERT INTO core.audit_events(actor_type,action,target_type,request_id) SELECT 'system','batch','audit','batch' FROM generate_series(1,251)",
    );
    const anchor = await verifyAuditIntegrity(db);
    expect(anchor.index).toBe('251');
    const [, during] = await Promise.all([append('during_verification'), verifyAuditIntegrity(db, anchor)]);
    expect(['251', '252']).toContain(during.index);
    expect((await verifyAuditIntegrity(db, anchor)).index).toBe('252');
  });
  it('CLI emits only a checkpoint, accepts that independent file and fails closed without secret/payload diagnostics', async () => {
    await append();
    const first = cli();
    expect(first.status).toBe(0);
    const checkpoint = JSON.parse(first.stdout) as AuditCheckpoint;
    expect(checkpoint).toEqual(await verifyAuditIntegrity(db));
    const dir = mkdtempSync(join(tmpdir(), 'boro-audit-'));
    try {
      const path = join(dir, 'checkpoint.json');
      writeFileSync(path, first.stdout);
      await append();
      expect(cli(path).status).toBe(0);
      await root.query("UPDATE core.audit_events SET action='private-tamper-marker' WHERE chain_index=1");
      const failed = cli(path);
      expect(failed.status).toBe(1);
      expect(failed.stdout).toBe('');
      expect(failed.stderr).not.toContain('private-tamper-marker');
      expect(failed.stderr).not.toContain(runtimeUrl);
      writeFileSync(path, '{"version":1}');
      expect(cli(path).status).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
