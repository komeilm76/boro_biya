import { describe, expect, it } from 'vitest';
import { nowUtcInstant, toUtcInstant, utcDateSchema, utcInstantSchema } from '../../src/time.js';

describe('utcInstantSchema — the API-36 wire timestamp contract', () => {
  it('accepts canonical UTC instants', () => {
    expect(utcInstantSchema.safeParse('2026-10-14T12:00:00Z').success).toBe(true);
    expect(utcInstantSchema.safeParse('2026-10-14T12:00:00.123Z').success).toBe(true);
    expect(utcInstantSchema.safeParse('2026-10-14T23:59:59.123456789Z').success).toBe(true);
    expect(utcInstantSchema.safeParse('2026-01-01T00:00:00Z').success).toBe(true);
  });

  it('rejects naive timestamps (no zone designator)', () => {
    expect(utcInstantSchema.safeParse('2026-10-14T12:00:00').success).toBe(false);
  });

  it('rejects non-UTC offsets', () => {
    expect(utcInstantSchema.safeParse('2026-10-14T12:00:00+02:00').success).toBe(false);
    expect(utcInstantSchema.safeParse('2026-10-14T12:00:00-05:00').success).toBe(false);
  });

  it('rejects a lowercase zone designator — the contract fixes the "Z" suffix', () => {
    expect(utcInstantSchema.safeParse('2026-10-14T12:00:00z').success).toBe(false);
  });

  it('rejects impossible calendar instants that Date.parse would silently roll over', () => {
    expect(utcInstantSchema.safeParse('2026-02-30T00:00:00Z').success).toBe(false);
    expect(utcInstantSchema.safeParse('2026-13-01T00:00:00Z').success).toBe(false);
    expect(utcInstantSchema.safeParse('2026-10-14T25:00:00Z').success).toBe(false);
  });

  it('rejects empty and non-string values', () => {
    expect(utcInstantSchema.safeParse('').success).toBe(false);
    expect(utcInstantSchema.safeParse(1_760_000_000).success).toBe(false);
    expect(utcInstantSchema.safeParse(null).success).toBe(false);
  });
});

describe('utcDateSchema — date-only fields say so explicitly', () => {
  it('accepts a calendar date and rejects a time component', () => {
    expect(utcDateSchema.safeParse('2026-10-14').success).toBe(true);
    expect(utcDateSchema.safeParse('2026-10-14T00:00:00Z').success).toBe(false);
  });

  it('rejects impossible dates', () => {
    expect(utcDateSchema.safeParse('2026-02-30').success).toBe(false);
  });
});

describe('serialization helpers', () => {
  it('always produces the Z suffix', () => {
    expect(toUtcInstant(new Date(Date.UTC(2026, 9, 14, 12))).endsWith('Z')).toBe(true);
    expect(nowUtcInstant()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(utcInstantSchema.safeParse(nowUtcInstant()).success).toBe(true);
  });
});
