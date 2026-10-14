import { describe, expect, it } from 'vitest';
import { correlationIdSchema } from '../../src/correlation.js';
import { errorCodeSchema, errorEnvelopeSchema } from '../../src/error-envelope.js';
import { healthResponseSchema, readyResponseSchema } from '../../src/health.js';
import { cursorPageQuerySchema, DEFAULT_PAGE_LIMIT } from '../../src/pagination.js';
import { idempotencyKeySchema, retryAfterSecondsSchema } from '../../src/idempotency.js';
import { SERVICE_NAMES, serviceNameSchema } from '../../src/services.js';
import { webClientConfigSchema } from '../../src/web-client.js';

describe('correlationIdSchema (SEC-73, API-22: bounded and URL-safe)', () => {
  it('accepts UUIDs and bounded identifiers', () => {
    expect(correlationIdSchema.safeParse('7c9e6679-7425-40de-944b-e07fc1f90ae7').success).toBe(true);
    expect(correlationIdSchema.safeParse('A1234567').success).toBe(true);
    expect(correlationIdSchema.safeParse('a'.repeat(64)).success).toBe(true);
  });

  it('rejects short, long, and injection-shaped values', () => {
    expect(correlationIdSchema.safeParse('a123456').success).toBe(false);
    expect(correlationIdSchema.safeParse('a'.repeat(65)).success).toBe(false);
    expect(correlationIdSchema.safeParse('id with spaces').success).toBe(false);
    expect(correlationIdSchema.safeParse('id\nX-Injected: 1').success).toBe(false);
    expect(correlationIdSchema.safeParse('../etc/passwd').success).toBe(false);
    expect(correlationIdSchema.safeParse('').success).toBe(false);
  });
});

describe('errorEnvelopeSchema (API-11)', () => {
  const valid = {
    code: 'not_found',
    message: 'No route matches this path and method.',
    requestId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  };

  it('accepts a canonical envelope, with or without field details', () => {
    expect(errorEnvelopeSchema.safeParse(valid).success).toBe(true);
    expect(
      errorEnvelopeSchema.safeParse({ ...valid, details: [{ field: 'body.email', issue: 'required' }] }).success,
    ).toBe(true);
  });

  it('rejects unstable codes, oversized messages, and malformed request identifiers', () => {
    expect(errorEnvelopeSchema.safeParse({ ...valid, code: 'NotFound' }).success).toBe(false);
    expect(errorEnvelopeSchema.safeParse({ ...valid, code: 'has spaces' }).success).toBe(false);
    expect(errorEnvelopeSchema.safeParse({ ...valid, message: 'x'.repeat(501) }).success).toBe(false);
    expect(errorEnvelopeSchema.safeParse({ ...valid, requestId: 'short' }).success).toBe(false);
    expect(
      errorEnvelopeSchema.safeParse({
        ...valid,
        details: Array.from({ length: 51 }, () => ({ field: 'f', issue: 'i' })),
      }).success,
    ).toBe(false);
  });

  it('keeps error codes lower_snake_case', () => {
    expect(errorCodeSchema.safeParse('internal_error').success).toBe(true);
    expect(errorCodeSchema.safeParse('InternalError').success).toBe(false);
  });
});

describe('health and readiness shapes (OPS-59 … OPS-61)', () => {
  it('requires the contract fields including a wire timestamp', () => {
    const valid = {
      status: 'ok',
      service: 'api',
      version: '0.1.0',
      commit: 'abc123',
      serverTime: '2026-10-14T12:00:00.000Z',
    };
    expect(healthResponseSchema.safeParse(valid).success).toBe(true);
    expect(healthResponseSchema.safeParse({ ...valid, serverTime: '2026-10-14T12:00:00' }).success).toBe(false);
    expect(healthResponseSchema.safeParse({ ...valid, service: 'unknown' }).success).toBe(false);
  });

  it('keeps readiness details to booleans (OPS-60)', () => {
    expect(readyResponseSchema.safeParse({ status: 'ready', service: 'api', checks: { database: true } }).success).toBe(
      true,
    );
    expect(
      readyResponseSchema.safeParse({ status: 'unavailable', service: 'sos', checks: { database: false } }).success,
    ).toBe(true);
    expect(
      readyResponseSchema.safeParse({ status: 'ready', service: 'api', checks: { database: 'yes' } }).success,
    ).toBe(false);
    expect(
      readyResponseSchema.safeParse({
        status: 'ready',
        service: 'api',
        checks: { database: true, detail: 'SELECT 1 in 2ms from host db-1' },
      }).success,
    ).toBe(false);
  });
});

describe('pagination and idempotency conventions (API-12, API-14, API-18)', () => {
  it('applies the documented default limit and bounds every input', () => {
    expect(cursorPageQuerySchema.parse({})).toEqual({ limit: DEFAULT_PAGE_LIMIT });
    expect(cursorPageQuerySchema.parse({ limit: '50' })).toEqual({ limit: 50 });
    expect(cursorPageQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(cursorPageQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(cursorPageQuerySchema.safeParse({ cursor: 'c'.repeat(513) }).success).toBe(false);
  });

  it('bounds idempotency keys and retry-after values', () => {
    expect(idempotencyKeySchema.safeParse('k'.repeat(16)).success).toBe(true);
    expect(idempotencyKeySchema.safeParse('k'.repeat(15)).success).toBe(false);
    expect(idempotencyKeySchema.safeParse('k'.repeat(129)).success).toBe(false);
    expect(idempotencyKeySchema.safeParse('key with spaces!!').success).toBe(false);
    expect(retryAfterSecondsSchema.parse('30')).toBe(30);
    expect(retryAfterSecondsSchema.safeParse(-1).success).toBe(false);
    expect(retryAfterSecondsSchema.safeParse(86_401).success).toBe(false);
  });
});

describe('service vocabulary and web client config', () => {
  it('names exactly the services that exist', () => {
    expect(SERVICE_NAMES).toEqual(['api', 'relation', 'sos', 'web']);
    expect(serviceNameSchema.safeParse('worker').success).toBe(false);
  });

  it('defaults the web client to same-origin and English (ADR-018)', () => {
    expect(webClientConfigSchema.parse({})).toEqual({ apiBase: '', defaultLocale: 'en' });
    expect(webClientConfigSchema.safeParse({ apiBase: 'http://api.internal' }).success).toBe(false);
    expect(webClientConfigSchema.safeParse({ apiBase: '/api' }).success).toBe(true);
    expect(webClientConfigSchema.safeParse({ defaultLocale: 'de' }).success).toBe(false);
  });
});
