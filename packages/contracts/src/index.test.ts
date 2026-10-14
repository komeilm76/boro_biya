import { describe, expect, it } from 'vitest';
import {
  CORRELATION_HEADER,
  correlationHeaders,
  createCorrelationId,
  makeHealthResponse,
  parseUtcInstant,
  toUtcInstant,
} from './index.js';

describe('wire contracts', () => {
  it('accepts an explicit UTC instant', () => {
    expect(parseUtcInstant('2026-10-14T12:30:00Z')).toBe('2026-10-14T12:30:00Z');
  });

  it('accepts a fractional UTC instant', () => {
    expect(parseUtcInstant('2026-10-14T12:30:00.123456Z')).toContain('Z');
  });

  it('rejects an offset other than Z', () => {
    expect(() => parseUtcInstant('2026-10-14T12:30:00+00:00')).toThrow();
  });

  it('rejects naive timestamps and date-only strings', () => {
    expect(() => parseUtcInstant('2026-10-14T12:30:00')).toThrow();
    expect(() => parseUtcInstant('2026-10-14')).toThrow();
  });

  it('rejects impossible calendar dates', () => {
    expect(() => parseUtcInstant('2026-02-30T12:30:00Z')).toThrow();
  });

  it('serializes a server clock as UTC', () => {
    expect(toUtcInstant(new Date('2026-10-14T12:30:00.000Z'))).toBe('2026-10-14T12:30:00.000Z');
  });

  it('preserves safe correlation identifiers and replaces untrusted values', () => {
    expect(createCorrelationId('service-hop-1')).toBe('service-hop-1');
    expect(createCorrelationId('bad value')).not.toBe('bad value');
  });

  it('uses the shared correlation header and returns a minimal health contract', () => {
    const correlationId = createCorrelationId('req-7');
    expect(correlationHeaders(correlationId)).toEqual({ [CORRELATION_HEADER]: 'req-7' });
    expect(makeHealthResponse('api', '1.0.0', 'abc1234')).toEqual({
      status: 'ok',
      service: 'api',
      version: '1.0.0',
      buildCommit: 'abc1234',
    });
  });
});
