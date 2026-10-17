import { describe, expect, it } from 'vitest';
import {
  nowUtcInstant,
  toUtcInstant,
  utcDateSchema,
  utcInstantSchema,
  utcInstantPattern,
  utcDatePattern,
} from '../../src/time.js';

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

/** Independent oracle for the pre-conversion UTC wire checks; never used by production code. */
function previousInstant(value: string): boolean {
  if (!utcInstantPattern.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 19) + 'Z' === value.slice(0, 19) + 'Z';
}
function previousDate(value: string): boolean {
  if (!utcDatePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

describe('portable UTC schema equivalence', () => {
  it('retains the previous leap-year acceptance for every four-digit year', () => {
    for (let year = 0; year <= 9999; year++) {
      const date = `${String(year).padStart(4, '0')}-02-29`;
      const instant = `${date}T00:00:00Z`;
      if (utcDateSchema.safeParse(date).success !== previousDate(date)) throw new Error(`date mismatch: ${date}`);
      if (utcInstantSchema.safeParse(instant).success !== previousInstant(instant))
        throw new Error(`instant mismatch: ${instant}`);
    }
  });
  it('retains month/day and clock boundaries, wire precision and uppercase-UTC-only shape', () => {
    const years = [
      '0000',
      '0001',
      '0099',
      '0100',
      '0400',
      '1600',
      '1700',
      '1900',
      '2000',
      '2026',
      '2100',
      '2400',
      '9999',
    ];
    for (const year of years)
      for (let month = 0; month <= 13; month++)
        for (let day = 0; day <= 32; day++) {
          const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          expect(utcDateSchema.safeParse(date).success, date).toBe(previousDate(date));
          const instant = `${date}T23:59:59.123456789Z`;
          expect(utcInstantSchema.safeParse(instant).success, instant).toBe(previousInstant(instant));
        }
    for (const hour of ['00', '23', '24', '25'])
      for (const minute of ['00', '59', '60'])
        for (const second of ['00', '59', '60']) {
          const value = `2026-10-17T${hour}:${minute}:${second}Z`;
          expect(utcInstantSchema.safeParse(value).success, value).toBe(previousInstant(value));
        }
    for (const tail of ['Z', '.1Z', '.123456789Z', '.1234567890Z', '.Z', '+00:00', '-00:00', 'z', '']) {
      const value = `2026-10-17T12:00:00${tail}`;
      expect(utcInstantSchema.safeParse(value).success, value).toBe(previousInstant(value));
    }
    expect(utcInstantSchema.safeParse('2026-10-17T12:00Z').success).toBe(false);
  });
});
