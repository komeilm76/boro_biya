#!/usr/bin/env node
import process from 'node:process';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEnvFile } from '@boro-biya/config';
import pg from 'pg';
import { CLUSTER_SERVICES, initCluster, type ClusterService } from './cluster.js';
import { migrateDown, migrateUp, migrationStatus } from './migrate.js';
import { redactConnectionString } from './redact.js';

/**
 * `boro-db` — the migration command line (OPS-20, QA-15, OPS-81 runbook).
 *
 * Commands:
 *   init-cluster                 ensure service roles, then apply every service's migrations
 *   up      [--service <key>]    apply pending migrations (all services when none is named)
 *   down    [--service <key>] [--steps N | --to N]
 *                                reverse applied migrations, newest first
 *   status  [--service <key>]    show applied and pending migrations
 *
 * Connection: `--admin-url` or the DB_ADMIN_URL environment variable (optionally loaded from
 * `--env-file`, default `./.env`). Output never prints a password: connection strings are
 * redacted at every print site (SEC-13).
 */
export interface CliOptions {
  command: 'init-cluster' | 'up' | 'down' | 'status' | 'help';
  adminUrl?: string;
  envFile: string | null;
  service?: ClusterService['key'];
  steps?: number;
  to?: number;
  repoRoot?: string;
}

export const USAGE = `usage: boro-db <init-cluster|up|down|status> [--service core|relation|sos] [--admin-url <url>]
       [--env-file <path>] [--steps N] [--to N]`;

export function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = { command: 'help', envFile: '.env' };
  const [first, ...rest] = argv;
  if (first !== undefined) {
    if (!['init-cluster', 'up', 'down', 'status', 'help'].includes(first)) {
      throw new Error(`unknown command "${first}"\n${USAGE}`);
    }
    options.command = first as CliOptions['command'];
  }
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    const next = (): string => {
      const value = rest[index + 1];
      if (value === undefined) throw new Error(`flag ${arg ?? ''} needs a value\n${USAGE}`);
      index += 1;
      return value;
    };
    switch (arg) {
      case '--service': {
        const value = next();
        const service = CLUSTER_SERVICES.find((candidate) => candidate.key === value);
        if (service === undefined) throw new Error(`unknown service "${value}"; expected core, relation, or sos`);
        options.service = service.key;
        break;
      }
      case '--admin-url':
        options.adminUrl = next();
        break;
      case '--env-file':
        options.envFile = next();
        break;
      case '--no-env-file':
        options.envFile = null;
        break;
      case '--steps': {
        const value = Number(next());
        if (!Number.isInteger(value) || value < 1) throw new Error('--steps must be a positive integer');
        options.steps = value;
        break;
      }
      case '--to': {
        const value = Number(next());
        if (!Number.isInteger(value) || value < 0) throw new Error('--to must be a non-negative integer');
        options.to = value;
        break;
      }
      case '--repo-root':
        options.repoRoot = next();
        break;
      default:
        throw new Error(`unknown flag "${arg ?? ''}"\n${USAGE}`);
    }
  }
  return options;
}

function selectedServices(options: CliOptions): readonly ClusterService[] {
  if (options.service === undefined) return CLUSTER_SERVICES;
  return CLUSTER_SERVICES.filter((service) => service.key === options.service);
}

export async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === 'help') {
    console.log(USAGE);
    return 0;
  }

  const env = options.envFile === null ? {} : (readEnvFile(options.envFile) ?? {});
  const adminUrl = options.adminUrl ?? env['DB_ADMIN_URL'] ?? process.env['DB_ADMIN_URL'];
  if (adminUrl === undefined || adminUrl === '') {
    console.error(
      'DB_ADMIN_URL is not set (environment or --admin-url); it is the administrative connection used for migrations.',
    );
    return 1;
  }
  console.log(`database: ${redactConnectionString(adminUrl)}`);

  const passwords = {
    core: env['CORE_DB_PASSWORD'] ?? process.env['CORE_DB_PASSWORD'] ?? '',
    relation: env['RELATION_DB_PASSWORD'] ?? process.env['RELATION_DB_PASSWORD'] ?? '',
    sos: env['SOS_DB_PASSWORD'] ?? process.env['SOS_DB_PASSWORD'] ?? '',
  };
  const log = (line: string): void => {
    console.log(line);
  };

  if (options.command === 'init-cluster') {
    const passwordVariables: Record<ClusterService['key'], string> = {
      core: 'CORE_DB_PASSWORD',
      relation: 'RELATION_DB_PASSWORD',
      sos: 'SOS_DB_PASSWORD',
    };
    for (const key of ['core', 'relation', 'sos'] as const) {
      if (passwords[key] === '') {
        console.error(`${passwordVariables[key]} is not set; refusing to initialize roles without passwords.`);
        return 1;
      }
    }
    await initCluster({
      adminConnectionString: adminUrl,
      passwords,
      ...(options.repoRoot !== undefined ? { repoRoot: options.repoRoot } : {}),
      log,
    });
    log('cluster initialized: roles ready, migrations applied');
    return 0;
  }

  const services = selectedServices(options);
  let failures = 0;
  for (const service of services) {
    const dir = options.repoRoot !== undefined ? `${options.repoRoot}/${service.migrationsDir}` : service.migrationsDir;
    const pool = new pg.Pool({ connectionString: adminUrl, max: 1, connectionTimeoutMillis: 5_000 });
    try {
      if (options.command === 'up') {
        const result = await migrateUp(pool, { schema: service.schema, migrationsDir: dir, log });
        log(
          result.applied.length > 0
            ? `${service.key}: applied ${result.applied.join(', ')}`
            : `${service.key}: already up to date (${result.alreadyApplied} applied)`,
        );
      } else if (options.command === 'down') {
        const reversed = await migrateDown(pool, {
          schema: service.schema,
          migrationsDir: dir,
          ...(options.steps !== undefined ? { steps: options.steps } : {}),
          ...(options.to !== undefined ? { toVersion: options.to } : {}),
          log,
        });
        log(
          reversed.length > 0
            ? `${service.key}: reversed ${reversed.join(', ')}`
            : `${service.key}: nothing to reverse`,
        );
      } else {
        const status = await migrationStatus(pool, { schema: service.schema, migrationsDir: dir });
        console.log(`${service.key} (schema ${service.schema}, role ${service.role}):`);
        for (const entry of status) {
          const state = entry.applied
            ? `applied ${entry.appliedAt ?? ''}${entry.checksumMatches === false ? ' — CHECKSUM MISMATCH' : ''}`
            : 'pending';
          console.log(`  ${String(entry.version).padStart(4, '0')}_${entry.name}: ${state}`);
        }
      }
    } catch (error) {
      failures += 1;
      console.error(`${service.key}: ${(error as Error).message}`);
    } finally {
      await pool.end();
    }
  }
  return failures === 0 ? 0 : 1;
}

// Run only as the bin entry point, so tests can import parseArgs/main without side effects.
// realpath on both sides: bin symlinks (node_modules/.bin/boro-db) must still match.
const isEntry = (() => {
  try {
    const invoked = process.argv[1];
    if (invoked === undefined) return false;
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(invoked));
  } catch {
    return false;
  }
})();

if (isEntry) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error((error as Error).message);
      process.exitCode = 1;
    });
}
