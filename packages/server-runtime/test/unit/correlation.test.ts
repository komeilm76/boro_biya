import { describe, expect, it } from 'vitest';
import { CORRELATION_ID_HEADER, REQUEST_ID_HEADER } from '@boro-biya/contracts';
import {
  correlationHeaders,
  newCorrelationId,
  safePathForLog,
  sanitizeIncomingCorrelationId,
} from '../../src/correlation.js';

describe('correlation identifiers (SEC-73)', () => {
  it('generates URL-safe unique identifiers', () => {
    const first = newCorrelationId();
    const second = newCorrelationId();
    expect(first).not.toBe(second);
    expect(sanitizeIncomingCorrelationId(first)).toBe(first);
  });

  it('accepts a valid incoming identifier and rejects everything else', () => {
    expect(sanitizeIncomingCorrelationId('trace-2026.10.14_abc')).toBe('trace-2026.10.14_abc');
    expect(sanitizeIncomingCorrelationId('  7c9e6679-7425-40de-944b-e07fc1f90ae7  ')).toBe(
      '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    );
    expect(sanitizeIncomingCorrelationId('short')).toBeNull();
    expect(sanitizeIncomingCorrelationId('id\ninjected: header')).toBeNull();
    expect(sanitizeIncomingCorrelationId(Array.isArray([]) ? '' : ['not', 'a', 'string'])).toBeNull();
    expect(sanitizeIncomingCorrelationId(undefined)).toBeNull();
    expect(sanitizeIncomingCorrelationId(12345678)).toBeNull();
  });

  it('propagates both header spellings across hops', () => {
    const headers = correlationHeaders('7c9e6679-7425-40de-944b-e07fc1f90ae7');
    expect(headers[CORRELATION_ID_HEADER]).toBe('7c9e6679-7425-40de-944b-e07fc1f90ae7');
    expect(headers[REQUEST_ID_HEADER]).toBe('7c9e6679-7425-40de-944b-e07fc1f90ae7');
  });

  it('logs pathnames only — never query strings (PRIV-10)', () => {
    expect(safePathForLog('/api/v1/recover?token=abc123')).toBe('/api/v1/recover');
    expect(safePathForLog('http://host/healthz?x=1')).toBe('/healthz');
  });
});
