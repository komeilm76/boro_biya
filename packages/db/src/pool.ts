import pg from 'pg';
import { redactConnectionString } from './redact.js';

export interface CreateDbOptions {
  /** Connection string for this service's own role and schema (OPS-16, OPS-17). */
  connectionString: string;
  /** Bounded pool size — never unlimited (OPS-48). */
  max?: number;
  connectTimeoutMillis?: number;
  statementTimeoutMillis?: number;
  applicationName?: string;
  /** Receives unexpected idle-client errors with a redacted, log-safe summary. */
  onUnexpectedError?: (summary: { message: string; code?: string }) => void;
}

export interface Db {
  readonly pool: pg.Pool;
  query(text: string, params?: readonly unknown[]): Promise<pg.QueryResult<pg.QueryResultRow>>;
  /** Short bounded reachability check for readiness probes (OPS-59). */
  ping(timeoutMs: number): Promise<boolean>;
  close(): Promise<void>;
}

/**
 * The bounded connection-pool factory every backend service uses (OPS-89, OPS-48). Queries are
 * parameterized; this package offers no string-built SQL path (SEC-42). Errors surfaced through
 * `onUnexpectedError` carry the driver's message and code only — never the connection string,
 * which is redacted at every print site (SEC-13).
 */
export function createDb(options: CreateDbOptions): Db {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    max: options.max ?? 10,
    connectionTimeoutMillis: options.connectTimeoutMillis ?? 2_000,
    statement_timeout: options.statementTimeoutMillis ?? 5_000,
    application_name: options.applicationName ?? 'boro-biya',
    allowExitOnIdle: true,
  });

  pool.on('error', (error: Error & { code?: string }) => {
    options.onUnexpectedError?.({ message: error.message, ...(error.code ? { code: error.code } : {}) });
  });

  return {
    pool,
    async query(text, params) {
      return pool.query(text, params as unknown[] | undefined);
    },
    async ping(timeoutMs) {
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      try {
        const client = await Promise.race([
          pool.connect(),
          new Promise<null>((resolveRace) => {
            timeoutHandle = setTimeout(() => resolveRace(null), timeoutMs);
          }),
        ]);
        if (client === null) return false;
        try {
          await client.query('SELECT 1');
          return true;
        } finally {
          client.release();
        }
      } catch {
        // Readiness reports "not ready"; the reason belongs in server logs, not the probe (OPS-60).
        return false;
      } finally {
        if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      }
    },
    async close() {
      await pool.end();
    },
  };
}

/** A log-safe description of a connection target for diagnostics. */
export function describeConnection(connectionString: string): string {
  return redactConnectionString(connectionString);
}
