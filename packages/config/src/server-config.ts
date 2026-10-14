import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { readEnvFile } from './env-file.js';
import { ConfigError, type ConfigIssue } from './errors.js';
import { isPlaceholder } from './placeholders.js';

/** The backend services that exist in Phase 1 (OPS-02 … OPS-04). */
export const SERVER_KINDS = ['api', 'relation', 'sos'] as const;
export type ServerKind = (typeof SERVER_KINDS)[number];

const KIND_DEFAULTS: Record<ServerKind, { serviceName: ServerKind; port: number; metricsPort: number }> = {
  api: { serviceName: 'api', port: 3_000, metricsPort: 9_000 },
  relation: { serviceName: 'relation', port: 3_001, metricsPort: 9_001 },
  sos: { serviceName: 'sos', port: 3_002, metricsPort: 9_002 },
};

const nodeEnvSchema = z.enum(['development', 'test', 'production'], {
  message: 'required; must be one of development, test, production',
});

const hostSchema = z.string().min(1, 'required (an IP address or hostname to bind)').max(253);

const portSchema = z.coerce.number().int().min(1).max(65_535, 'must be a port number in 1-65535');

const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

const booleanSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.enum(['true', 'false'], { message: 'must be exactly "true" or "false"' }))
  .transform((value) => value === 'true');

/** Connection strings are security-sensitive: every failure message is written by hand (SEC-13). */
const postgresUrlSchema = z
  .string()
  .min(1, 'required; a PostgreSQL connection string for this service\u2019s own database')
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'postgres:' || url.protocol === 'postgresql:';
    } catch {
      return false;
    }
  }, 'must be a postgres:// or postgresql:// connection string');

const httpUrlSchema = (variable: string) =>
  z
    .string()
    .min(1, `required; the ${variable} of the web origin, e.g. http://localhost:5173`)
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    }, 'must be an absolute http:// or https:// URL');

/**
 * CORS_ALLOWED_ORIGINS is an explicit list of origins; a wildcard is rejected in every
 * environment (SEC-44: wildcard origins are rejected in production, and the same-origin proxy
 * topology means development never needs one either).
 */
const originListSchema = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== ''),
  )
  .superRefine((entries, context) => {
    entries.forEach((entry, index) => {
      if (entry === '*') {
        context.addIssue({
          code: 'custom',
          message: `entry ${index + 1} is a wildcard; list explicit origins (SEC-44)`,
          path: [String(index)],
        });
        return;
      }
      let url: URL;
      try {
        url = new URL(entry);
      } catch {
        context.addIssue({
          code: 'custom',
          message: `entry ${index + 1} is not an absolute URL`,
          path: [String(index)],
        });
        return;
      }
      const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
      const bareOrigin = url.pathname === '/' || url.pathname === '';
      if (!isHttp || !bareOrigin || url.username !== '' || url.search !== '' || url.hash !== '') {
        context.addIssue({
          code: 'custom',
          message: `entry ${index + 1} must be a bare http(s) origin without credentials, path, or query`,
          path: [String(index)],
        });
      }
    });
  });

const timeoutMsSchema = (fallbackMessage: string) => z.coerce.number().int().min(1).max(600_000, fallbackMessage);

/** Parsed, validated configuration shared by every backend service (OPS-36). */
export interface ServerConfig {
  nodeEnv: 'development' | 'test' | 'production';
  service: ServerKind;
  apiHost: string;
  apiPort: number;
  metricsHost: string;
  metricsPort: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  trustProxy: boolean;
  corsAllowedOrigins: string[];
  databaseUrl: string;
  dbPoolMax: number;
  dbConnectTimeoutMs: number;
  dbStatementTimeoutMs: number;
  gracefulShutdownTimeoutSeconds: number;
  buildCommit: string;
  /** Only the core API serves browser clients directly, so only it names the web origin. */
  webOrigin?: string;
}

/** Environment variable names this schema reads, used for placeholder detection. */
const SCHEMA_VARIABLES = [
  'NODE_ENV',
  'SERVICE_NAME',
  'API_HOST',
  'API_PORT',
  'METRICS_HOST',
  'METRICS_PORT',
  'LOG_LEVEL',
  'TRUST_PROXY',
  'CORS_ALLOWED_ORIGINS',
  'DATABASE_URL',
  'DB_POOL_MAX',
  'DB_CONNECT_TIMEOUT_MS',
  'DB_STATEMENT_TIMEOUT_MS',
  'GRACEFUL_SHUTDOWN_TIMEOUT_SECONDS',
  'BUILD_COMMIT',
  'WEB_ORIGIN',
] as const;

function buildEnvSchema(kind: ServerKind) {
  const defaults = KIND_DEFAULTS[kind];
  const shape = {
    NODE_ENV: nodeEnvSchema,
    SERVICE_NAME: z.enum(SERVER_KINDS).default(defaults.serviceName),
    API_HOST: hostSchema.default('127.0.0.1'),
    API_PORT: portSchema.default(defaults.port),
    METRICS_HOST: hostSchema.default('127.0.0.1'),
    METRICS_PORT: portSchema.default(defaults.metricsPort),
    LOG_LEVEL: logLevelSchema.default('info'),
    TRUST_PROXY: booleanSchema.default(false),
    CORS_ALLOWED_ORIGINS: originListSchema.default([]),
    DATABASE_URL: postgresUrlSchema,
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DB_CONNECT_TIMEOUT_MS: timeoutMsSchema('must be 1-600000 milliseconds').default(2_000),
    DB_STATEMENT_TIMEOUT_MS: timeoutMsSchema('must be 1-600000 milliseconds').default(5_000),
    GRACEFUL_SHUTDOWN_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(300).default(10),
    BUILD_COMMIT: z.string().min(1).max(64).default('dev'),
    // Validated per-kind below: required for the core API, ignored by the services.
    WEB_ORIGIN: z.string().max(2_000).optional(),
  };
  return z.object(shape);
}

export interface ReadServerConfigOptions {
  kind: ServerKind;
  /** Environment to read; defaults to `process.env`. */
  env?: Readonly<Record<string, string | undefined>>;
  /**
   * Path to a `.env` file whose values sit *under* the real environment. Defaults to `./.env`
   * when that file exists; pass `null` to skip file loading entirely (tests, containers).
   */
  envFilePath?: string | null;
}

/**
 * Read and validate the configuration for one service. Fails startup with a `ConfigError` that
 * names variables and problems but never values (OPS-53). Placeholders copied from
 * `.env.example` are reported as their own actionable problem.
 */
export function readServerConfig(options: ReadServerConfigOptions): ServerConfig {
  const { kind } = options;
  const processEnv = options.env ?? process.env;

  let filePath = options.envFilePath;
  if (filePath === undefined) {
    const candidate = resolve('.env');
    filePath = existsSync(candidate) ? candidate : null;
  }
  const fileEnv = filePath === null ? {} : (readEnvFile(filePath) ?? {});

  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(fileEnv)) {
    if (value !== undefined) merged[key] = value;
  }
  for (const variable of SCHEMA_VARIABLES) {
    const value = processEnv[variable];
    if (value !== undefined) merged[variable] = value;
  }

  const placeholderIssues: ConfigIssue[] = [];
  for (const variable of SCHEMA_VARIABLES) {
    const value = merged[variable];
    if (value !== undefined && isPlaceholder(value)) {
      placeholderIssues.push({
        variable,
        problem: 'still contains the .env.example placeholder; run "bun run env:create" or set a real value',
      });
    }
  }
  if (placeholderIssues.length > 0) {
    throw new ConfigError(kind, placeholderIssues);
  }

  const schema = buildEnvSchema(kind);
  const result = schema.safeParse(merged);
  if (!result.success) {
    const issues: ConfigIssue[] = result.error.issues.map((issue) => ({
      variable: issue.path.length > 0 ? issue.path.join('_') : '(environment)',
      problem: issue.message,
    }));
    throw new ConfigError(kind, issues);
  }

  const raw = result.data;
  const config: ServerConfig = {
    nodeEnv: raw.NODE_ENV,
    service: raw.SERVICE_NAME,
    apiHost: raw.API_HOST,
    apiPort: raw.API_PORT,
    metricsHost: raw.METRICS_HOST,
    metricsPort: raw.METRICS_PORT,
    logLevel: raw.LOG_LEVEL,
    trustProxy: raw.TRUST_PROXY,
    corsAllowedOrigins: raw.CORS_ALLOWED_ORIGINS,
    databaseUrl: raw.DATABASE_URL,
    dbPoolMax: raw.DB_POOL_MAX,
    dbConnectTimeoutMs: raw.DB_CONNECT_TIMEOUT_MS,
    dbStatementTimeoutMs: raw.DB_STATEMENT_TIMEOUT_MS,
    gracefulShutdownTimeoutSeconds: raw.GRACEFUL_SHUTDOWN_TIMEOUT_SECONDS,
    buildCommit: raw.BUILD_COMMIT,
  };
  if (kind === 'api') {
    const webOrigin = httpUrlSchema('web origin').safeParse(raw.WEB_ORIGIN);
    if (!webOrigin.success) {
      throw new ConfigError(
        kind,
        webOrigin.error.issues.map((issue) => ({ variable: 'WEB_ORIGIN', problem: issue.message })),
      );
    }
    config.webOrigin = webOrigin.data;
  }
  return config;
}
