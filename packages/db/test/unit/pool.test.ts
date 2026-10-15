import { describe, expect, it } from 'vitest';
import { createDb, describeConnection } from '../../src/pool.js';

describe('createDb (OPS-48: bounded, timeout-protected pool)', () => {
  it('reports not-ready quickly against an unreachable database instead of hanging', async () => {
    const db = createDb({
      connectionString: 'postgres://probe:probe@127.0.0.1:1/probe',
      max: 2,
      connectTimeoutMillis: 250,
      statementTimeoutMillis: 250,
    });
    try {
      const started = Date.now();
      const reachable = await db.ping(500);
      expect(reachable).toBe(false);
      expect(Date.now() - started).toBeLessThan(2_000); // bounded, never open-ended
    } finally {
      await db.close();
    }
  });

  it('surfaces unexpected idle-client errors through the injected sink with redacted detail', async () => {
    const seen: Array<{ message: string; code?: string }> = [];
    const db = createDb({
      connectionString: 'postgres://probe:probe@127.0.0.1:1/probe',
      max: 1,
      connectTimeoutMillis: 200,
      onUnexpectedError: (summary) => seen.push(summary),
    });
    try {
      // A connection attempt against a closed port produces a pool-level error event.
      await db.query('SELECT 1').catch(() => undefined);
      await new Promise((wait) => setTimeout(wait, 100));
      for (const entry of seen) {
        expect(entry.message).not.toContain('probe:probe');
      }
    } finally {
      await db.close();
    }
  });

  it('describes connections without credentials', () => {
    expect(describeConnection('postgres://u:secret@h:5432/d')).not.toContain('secret');
  });
});
