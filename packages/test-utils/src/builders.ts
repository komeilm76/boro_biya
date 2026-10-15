import {
  buildErrorEnvelope,
  ERROR_CODES,
  nowUtcInstant,
  type ErrorEnvelope,
  type HealthResponse,
  type ReadyResponse,
} from '@boro-biya/contracts';
import type { ServerConfig } from '@boro-biya/config';
import { healthResponseSchema, readyResponseSchema } from '@boro-biya/validation';

/**
 * Shared fixtures and builders (OPS-38). Every fixture is validated against the production
 * schema before it is returned, so a fixture that drifts from the contract fails the test that
 * builds it instead of silently teaching tests a wrong shape (GOV-67: fixtures come from shared builders that match production shapes).
 */
export function makeCorrelationIdFixture(): string {
  return globalThis.crypto.randomUUID();
}

export function makeErrorEnvelopeFixture(
  overrides: Partial<Parameters<typeof buildErrorEnvelope>[0]> = {},
): ErrorEnvelope {
  return buildErrorEnvelope({
    code: ERROR_CODES.internal,
    message: 'The service could not process this request. The team can look it up by the request identifier.',
    requestId: makeCorrelationIdFixture(),
    ...overrides,
  });
}

export function makeHealthFixture(overrides: Partial<Omit<HealthResponse, 'status'>> = {}): HealthResponse {
  return healthResponseSchema.parse({
    status: 'ok',
    service: 'api',
    version: '0.0.0-test',
    commit: 'test-commit',
    serverTime: nowUtcInstant(),
    ...overrides,
  });
}

export function makeReadyFixture(
  status: 'ready' | 'unavailable' = 'ready',
  checks: Record<string, boolean> = { database: status === 'ready' },
): ReadyResponse {
  return readyResponseSchema.parse({ status, service: 'api', checks });
}

/** A capturing log sink plus parsed lines — the shared builder for log assertions (SEC-57/73 tests). */
export interface CapturedLog {
  sink: (line: string) => void;
  raw: string[];
  lines(): Array<Record<string, unknown>>;
}

export function makeCapturedLog(): CapturedLog {
  const raw: string[] = [];
  return {
    sink: (line: string): void => {
      raw.push(line);
    },
    raw,
    lines() {
      return raw.map((line) => JSON.parse(line) as Record<string, unknown>);
    },
  };
}

/**
 * A complete, valid server configuration with test-safe values (the database URL points at a
 * closed port — readiness must be injected or integration-provided, never assumed).
 */
export function makeServerConfigFixture(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    nodeEnv: 'test',
    service: 'api',
    apiHost: '127.0.0.1',
    apiPort: 3_000,
    metricsHost: '127.0.0.1',
    metricsPort: 9_000,
    logLevel: 'info',
    trustProxy: false,
    corsAllowedOrigins: [],
    databaseUrl: 'postgres://test-role:test-only@127.0.0.1:1/test_db',
    dbPoolMax: 2,
    dbConnectTimeoutMs: 500,
    dbStatementTimeoutMs: 500,
    gracefulShutdownTimeoutSeconds: 1,
    buildCommit: 'test-commit',
    ...overrides,
  };
}
