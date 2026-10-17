import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { inspect } from 'node:util';
import pg from 'pg';
import EmbeddedPostgres from 'embedded-postgres';
import { inject } from 'vitest';

/**
 * Typing for the value the integration run's global setup provides. The augmentation lives
 * here — not in the setup file — so every test that imports this module sees a typed
 * `inject('pgAdminUrl')` without importing the setup itself.
 */
declare module 'vitest' {
  export interface ProvidedContext {
    /** Administrative connection string of the run's disposable PostgreSQL server. */
    pgAdminUrl: string;
  }
}

/** The run's disposable-server admin URL, validated at the seam instead of trusted. */
export function injectedPgAdminUrl(): string {
  const value: unknown = inject('pgAdminUrl');
  if (typeof value !== 'string' || value === '') {
    throw new Error("integration setup did not provide 'pgAdminUrl' — run through vitest.integration.config.ts");
  }
  return value;
}

/**
 * The disposable PostgreSQL 18 harness for integration tests (QA-06, QA-15).
 *
 * Default mode starts a real PostgreSQL 18 server from the embedded binaries (MIT-licensed
 * npm distribution of the official server; recorded in the dependency policy). This keeps the
 * documented command set identical on Linux and Windows and works in environments without
 * Docker. One Windows constraint shapes the CI matrix: the postmaster refuses to run under an
 * elevated administrator token (hosted Windows runners are elevated), so there the job
 * provisions these same pinned binaries under a disposable standard user and passes the server
 * in through `TEST_DATABASE_URL`, which switches the harness to an externally provided server
 * (a Compose database, a CI-provisioned one) without changing a single test.
 *
 * Credentials created here are disposable values that exist only for the lifetime of a test
 * run on a loopback interface; they are never production-like secrets (OPS-70).
 */
export const TEST_ADMIN_USER = 'boro_test_admin';
export const TEST_ADMIN_PASSWORD = 'disposable-test-only';

export interface TestDatabaseServer {
  adminConnectionString: string;
  port: number;
  /** PostgreSQL server version reported by the instance. */
  serverVersion(): Promise<string>;
  createDatabase(prefix: string): Promise<TestDatabaseHandle>;
  /**
   * Ensure a database with an exact name exists and return its administrative URL. Used by the
   * Docker-less development database (scripts/dev-db.mjs) to mirror the Compose layout, where
   * POSTGRES_DB names the single application database.
   */
  ensureDatabase(name: string): Promise<string>;
  stop(): Promise<void>;
}

export interface StartOptions {
  /** Bind a fixed port instead of an OS-assigned one (the dev-db tool uses the .env port). */
  port?: number;
  /** Keep the data directory between runs (local development without Docker). */
  persistent?: boolean;
  /** Data directory for persistent mode; required when persistent is true. */
  databaseDir?: string;
}

const DATABASE_NAME = /^[a-z][a-z0-9_]{0,62}$/;

async function ensureDatabaseOn(adminConnectionString: string, name: string): Promise<string> {
  if (!DATABASE_NAME.test(name)) {
    throw new Error(`unsafe database name rejected: must match ${DATABASE_NAME.source}`);
  }
  await withAdminClient(adminConnectionString, async (client) => {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if ((existing.rowCount ?? 0) === 0) {
      // Identifier validated against the fixed pattern above; no parameter placeholder exists
      // for database names in CREATE DATABASE (SEC-42 reasoning documented in packages/db).
      await client.query(`CREATE DATABASE ${name}`);
    }
  });
  return withDatabase(adminConnectionString, name);
}

async function findFreePort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const probe = createServer();
    probe.once('error', rejectPort);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => {
        if (address !== null && typeof address === 'object') resolvePort(address.port);
        else rejectPort(new Error('could not allocate a free port'));
      });
    });
  });
}

function buildAdminConnectionString(port: number, database = 'postgres'): string {
  return `postgresql://${TEST_ADMIN_USER}:${TEST_ADMIN_PASSWORD}@127.0.0.1:${port}/${database}`;
}

async function withAdminClient(connectionString: string, run: (client: pg.Client) => Promise<void>): Promise<void> {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    await run(client);
  } finally {
    await client.end();
  }
}

function makeDatabaseName(prefix: string): string {
  const safe = prefix
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .slice(0, 24);
  const unique = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  return `t_${safe}_${unique}`.slice(0, 63);
}

function withDatabase(connectionString: string, database: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  return url.toString();
}

export interface TestDatabaseHandle {
  name: string;
  /** Administrative connection string targeting this database. */
  adminConnectionString: string;
  drop(): Promise<void>;
}

/** Create one isolated database on a server the caller administers; drop it in teardown. */
export async function createDatabaseFor(adminConnectionString: string, prefix: string): Promise<TestDatabaseHandle> {
  const name = makeDatabaseName(prefix);
  await withAdminClient(adminConnectionString, async (client) => {
    await client.query(`CREATE DATABASE ${name}`);
  });
  return {
    name,
    adminConnectionString: withDatabase(adminConnectionString, name),
    async drop() {
      await withAdminClient(adminConnectionString, async (client) => {
        await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      });
    },
  };
}

/** Start (or attach to) the disposable database server for one test run. */
export async function startTestDatabaseServer(options: StartOptions = {}): Promise<TestDatabaseServer> {
  const external = process.env['TEST_DATABASE_URL'];
  if (external !== undefined && external !== '') {
    const url = new URL(external);
    const port = Number(url.port === '' ? 5432 : url.port);
    return {
      adminConnectionString: external,
      port,
      async serverVersion() {
        let version = 'unknown';
        await withAdminClient(external, async (client) => {
          const result = await client.query('SHOW server_version');
          const row = (result.rows as Array<Record<string, unknown>>)[0];
          const rawVersion = row?.['server_version'];
          version = typeof rawVersion === 'string' ? rawVersion : 'unknown';
        });
        return version;
      },
      createDatabase(prefix) {
        return createDatabaseFor(external, prefix);
      },
      ensureDatabase(name) {
        return ensureDatabaseOn(external, name);
      },
      async stop() {
        // Externally provided servers are not owned by the test run.
      },
    };
  }

  const persistent = options.persistent === true;
  const port = options.port ?? (await findFreePort());
  const databaseDir = options.databaseDir ?? (persistent ? undefined : mkdtempSync(join(tmpdir(), 'boro-biya-pg-')));
  if (databaseDir === undefined) throw new Error('persistent mode requires databaseDir');
  // PostgreSQL's own output is captured in a bounded ring buffer instead of streamed: the
  // upstream start() rejects with NO value when the server process exits before printing its
  // readiness message, and this buffer is the only channel carrying the real reason (a locale
  // rejection, a missing library, data-directory permissions). Startup failures below rethrow
  // with its tail, so a failing run names the cause instead of an empty error.
  const startupLog: string[] = [];
  const STARTUP_LOG_LINES = 200;
  const recordLog = (message: unknown): void => {
    for (const line of String(message).split(/\r?\n/)) {
      startupLog.push(line);
      if (startupLog.length > STARTUP_LOG_LINES) startupLog.shift();
    }
  };
  const server = new EmbeddedPostgres({
    databaseDir,
    port,
    user: TEST_ADMIN_USER,
    password: TEST_ADMIN_PASSWORD,
    persistent,
    initdbFlags: ['--auth=password'],
    onLog: recordLog,
    onError: (message) => {
      recordLog(message);
      process.stderr.write(`[embedded-postgres] ${String(message)}\n`);
    },
  });
  // A persistent cluster is initialised once; initdb refuses a non-empty data directory, so
  // PG_VERSION is the marker that the cluster already exists (documented embedded-postgres
  // behaviour: initialise() is only needed the first time).
  mkdirSync(databaseDir, { recursive: true });
  const STARTUP_BUDGET_MS = 150_000;
  const startup = (async () => {
    if (!existsSync(join(databaseDir, 'PG_VERSION'))) {
      await server.initialise();
    }
    await server.start();
  })();
  // If the budget expires, `startup` may still settle later; this subscription keeps a late
  // rejection from escaping as an unhandled one after the race has already been decided.
  void startup.catch(() => undefined);
  let budgetTimer: NodeJS.Timeout | undefined;
  const budgetExhausted = new Promise<never>((_resolve, rejectBudget) => {
    budgetTimer = setTimeout(
      () => rejectBudget(new Error(`PostgreSQL did not report readiness within ${STARTUP_BUDGET_MS} ms`)),
      STARTUP_BUDGET_MS,
    );
  });
  try {
    await Promise.race([startup, budgetExhausted]);
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.message
        : error === null || error === undefined
          ? 'the PostgreSQL process exited before reporting readiness'
          : inspect(error);
    const tail = startupLog.slice(-40).join('\n');
    throw new Error(
      `disposable PostgreSQL failed to start on ${process.platform}/${process.arch}, port ${port}: ${reason}. ` +
        `embedded-postgres output tail:\n${tail === '' ? '(nothing captured)' : tail}`,
      { cause: error },
    );
  } finally {
    clearTimeout(budgetTimer);
  }

  const adminConnectionString = buildAdminConnectionString(port);
  let stopped = false;

  return {
    adminConnectionString,
    port,
    async serverVersion() {
      let version = 'unknown';
      await withAdminClient(adminConnectionString, async (client) => {
        const result = await client.query('SHOW server_version');
        const row = (result.rows as Array<Record<string, unknown>>)[0];
        const rawVersion = row?.['server_version'];
        version = typeof rawVersion === 'string' ? rawVersion : 'unknown';
      });
      return version;
    },
    createDatabase(prefix) {
      return createDatabaseFor(adminConnectionString, prefix);
    },
    ensureDatabase(name) {
      return ensureDatabaseOn(adminConnectionString, name);
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      await server.stop();
      if (!persistent) {
        // Non-persistent mode owns its temporary directory; persistent mode keeps its data.
        rmSync(databaseDir, { recursive: true, force: true });
      }
    },
  };
}

// Node-only process fixtures for database-backed built-artefact tests.
export { allocateServiceTestPorts, startTestService, type RunningTestService } from './service-process.js';
