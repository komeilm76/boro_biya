import { Pool } from 'pg';

/** Creates a bounded PostgreSQL pool, or `undefined` when readiness has no configured database. */
export function createDatabasePool(
  connectionString: string | undefined,
  max = 10,
): Pool | undefined {
  if (!connectionString) return undefined;
  return new Pool({
    connectionString,
    max,
    connectionTimeoutMillis: 1_500,
    idleTimeoutMillis: 30_000,
    allowExitOnIdle: false,
  });
}
