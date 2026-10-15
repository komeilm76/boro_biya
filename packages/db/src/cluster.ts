import { isAbsolute, join } from 'node:path';
import pg from 'pg';
import { assertSafeIdentifier } from './identifiers.js';
import { migrateUp } from './migrate.js';
import { redactConnectionString } from './redact.js';

/**
 * The database cluster map: one PostgreSQL instance, one schema and one least-privilege role per
 * service (OPS-16 … OPS-18). Roles are created by the migration step, which runs with the
 * administrative connection; services themselves connect only with their own role, and the
 * permission-isolation integration test proves a service role cannot read another service's
 * schema (OPS-18: violations are caught by permission tests, not review).
 *
 * The schema-per-service isolation arrives with this first migration framework; the documented
 * database-per-service split (OPS-16, Q-22) remains the trigger path when cross-service load or
 * failure isolation demands it.
 */
export interface ClusterService {
  /** Stable service key used by the CLI and compose. */
  key: 'core' | 'relation' | 'sos';
  schema: string;
  role: string;
  /** Repository-relative migrations directory (OPS-20: every migration declares its owner). */
  migrationsDir: string;
  /** Environment variable holding this role's password. */
  passwordEnv: 'CORE_DB_PASSWORD' | 'RELATION_DB_PASSWORD' | 'SOS_DB_PASSWORD';
}

export const CLUSTER_SERVICES: readonly ClusterService[] = [
  {
    key: 'core',
    schema: 'core',
    role: 'boro_core',
    migrationsDir: 'apps/api/migrations',
    passwordEnv: 'CORE_DB_PASSWORD',
  },
  {
    key: 'relation',
    schema: 'relation',
    role: 'boro_relation',
    migrationsDir: 'services/relation/migrations',
    passwordEnv: 'RELATION_DB_PASSWORD',
  },
  {
    key: 'sos',
    schema: 'sos',
    role: 'boro_sos',
    migrationsDir: 'services/sos/migrations',
    passwordEnv: 'SOS_DB_PASSWORD',
  },
] as const;

export interface InitClusterOptions {
  /** Administrative connection string (the database owner). Never printed unredacted. */
  adminConnectionString: string;
  /** Passwords per service key, read from the environment by the CLI. */
  passwords: Readonly<Record<ClusterService['key'], string>>;
  /** Repository root used to resolve migrations directories. */
  repoRoot?: string;
  /**
   * Ensure an administrative LOGIN role (name + password) alongside the service roles, so a
   * `DB_ADMIN_URL` built from `.env` works against any instance — including the Docker-less
   * development database, whose bootstrap superuser otherwise has a harness-local name.
   */
  adminRole?: { name: string; password: string };
  log?: (line: string) => void;
}

/**
 * Quote a string as a SQL literal. PostgreSQL utility statements (ALTER ROLE … PASSWORD) do not
 * accept parameter placeholders, so this is the one place a value is embedded in statement text.
 * It is safe under the server default `standard_conforming_strings = on` (every supported
 * PostgreSQL since 9.1): doubling single quotes is the complete escaping rule, and NUL bytes —
 * the only character that cannot appear in a SQL literal — are rejected outright. The value
 * comes from administrative configuration, never from a request (SEC-42).
 */
function quoteLiteral(value: string): string {
  if (value.includes('\0')) {
    throw new Error('role password contains a NUL byte; rejected');
  }
  return `'${value.replace(/'/g, "''")}'`;
}

async function ensureRole(client: pg.Client, role: string, password: string): Promise<void> {
  const safeRole = assertSafeIdentifier(role, 'role');
  const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [safeRole]);
  if (exists.rowCount === 0) {
    // The role name comes from the fixed CLUSTER_SERVICES constant and passed the identifier
    // check above; the password is quoted by quoteLiteral, whose contract is documented there.
    await client.query(`CREATE ROLE ${safeRole} LOGIN`);
  }
  await client.query(`ALTER ROLE ${safeRole} LOGIN PASSWORD ${quoteLiteral(password)}`);
}

/**
 * Idempotent cluster initialization: roles exist with current passwords, and every service's
 * migrations are applied. Safe to re-run (compose `migrate` job, `bun run db:migrate`).
 */
export async function initCluster(options: InitClusterOptions): Promise<void> {
  const log = options.log ?? (() => undefined);
  const repoRoot = options.repoRoot ?? process.cwd();
  const client = new pg.Client({ connectionString: options.adminConnectionString, connectionTimeoutMillis: 5_000 });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `cannot reach the database at ${redactConnectionString(options.adminConnectionString)}: ${(error as Error).message}`,
      { cause: error },
    );
  }
  try {
    if (options.adminRole !== undefined) {
      const safeName = assertSafeIdentifier(options.adminRole.name, 'role');
      if (options.adminRole.password === '') {
        throw new Error('admin role password is empty; refusing to create an admin role without one');
      }
      const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [safeName]);
      if (exists.rowCount === 0) {
        // SUPERUSER mirrors what the Compose database's POSTGRES_USER already is; this path
        // exists for development parity, never for production (production roles are provisioned
        // by the deployment, OPS-72).
        await client.query(`CREATE ROLE ${safeName} LOGIN SUPERUSER`);
      }
      await client.query(`ALTER ROLE ${safeName} LOGIN PASSWORD ${quoteLiteral(options.adminRole.password)}`);
      log(`admin role ${safeName} ready`);
    }
    for (const service of CLUSTER_SERVICES) {
      const password = options.passwords[service.key];
      if (password === '')
        throw new Error(`password for service "${service.key}" is empty; refusing to create a role without one`);
      await ensureRole(client, service.role, password);
      log(`role ${service.role} ready`);
    }
    for (const service of CLUSTER_SERVICES) {
      const dir = isAbsolute(service.migrationsDir) ? service.migrationsDir : join(repoRoot, service.migrationsDir);
      const adminPool = new pg.Pool({ connectionString: options.adminConnectionString, max: 1 });
      try {
        const result = await migrateUp(adminPool, { schema: service.schema, migrationsDir: dir, log });
        if (result.applied.length === 0) log(`schema ${service.schema}: no pending migrations`);
      } finally {
        await adminPool.end();
      }
    }
  } finally {
    await client.end();
  }
}

/** Build a service-role connection string from the admin URL (host, port, database preserved). */
export function serviceConnectionString(
  adminConnectionString: string,
  service: ClusterService,
  password: string,
): string {
  const url = new URL(adminConnectionString);
  url.username = service.role;
  url.password = password;
  return url.toString();
}
