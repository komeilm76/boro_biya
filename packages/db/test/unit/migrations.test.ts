import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertSafeIdentifier, readMigrations, redactConnectionString } from '../../src/index.js';

const tempDirs: string[] = [];
function fixtureDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'boro-migrations-'));
  tempDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content, 'utf8');
  }
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

describe('readMigrations (OPS-20, QA-93)', () => {
  it('pairs, orders, and checksums migrations', () => {
    const dir = fixtureDir({
      '0002_second.up.sql': 'SELECT 2;',
      '0001_first.up.sql': 'SELECT 1;',
      '0001_first.down.sql': 'SELECT 0;',
      '0002_second.down.sql': 'SELECT 0;',
      'notes.txt': 'ignored',
    });
    const migrations = readMigrations(dir);
    expect(migrations.map((migration) => migration.version)).toEqual([1, 2]);
    expect(migrations[0]?.name).toBe('first');
    expect(migrations[0]?.upSql).toBe('SELECT 1;');
    expect(migrations[0]?.checksum).toBe(createHash('sha256').update('SELECT 1;').digest('hex'));
  });

  it('rejects a migration without a reversal', () => {
    const dir = fixtureDir({ '0001_only.up.sql': 'SELECT 1;' });
    expect(() => readMigrations(dir)).toThrow(/\.down\.sql/);
  });

  it('rejects two names for one version', () => {
    const dir = fixtureDir({
      '0001_alpha.up.sql': 'SELECT 1;',
      '0001_alpha.down.sql': 'SELECT 0;',
      '0001_beta.up.sql': 'SELECT 2;',
      '0001_beta.down.sql': 'SELECT 0;',
    });
    expect(() => readMigrations(dir)).toThrow(/two different names/);
  });
});

describe('identifier safety (SEC-42)', () => {
  it('accepts the fixed schema and role shapes', () => {
    expect(assertSafeIdentifier('core', 'schema')).toBe('core');
    expect(assertSafeIdentifier('boro_relation', 'role')).toBe('boro_relation');
  });

  it('rejects anything that could carry SQL', () => {
    expect(() => assertSafeIdentifier('core; DROP TABLE users', 'schema')).toThrow(/unsafe/);
    expect(() => assertSafeIdentifier('Core', 'schema')).toThrow(/unsafe/);
    expect(() => assertSafeIdentifier('', 'role')).toThrow(/unsafe/);
    expect(() => assertSafeIdentifier('1starts_with_digit', 'role')).toThrow(/unsafe/);
    expect(() => assertSafeIdentifier('x'.repeat(64), 'role')).toThrow(/unsafe/);
  });
});

describe('connection-string redaction (SEC-13)', () => {
  it('hides the password and keeps the shape diagnosable', () => {
    const redacted = redactConnectionString('postgres://boro_core:sup3r-secret@db.internal:5432/boro_biya');
    expect(redacted).not.toContain('sup3r-secret');
    expect(redacted).toContain('boro_core');
    expect(redacted).toContain(':redacted@');
  });

  it('never echoes an unparseable value', () => {
    expect(redactConnectionString('this is not a connection string')).toBe('[unparseable connection string]');
    expect(redactConnectionString('postgres://user:pass words@host/db')).not.toContain('pass words');
  });
});
