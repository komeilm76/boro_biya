import { describe, expect, it } from 'vitest';
import { emptyInputSchema, utcInstantSchema } from './index.js';

describe('shared input schemas', () => {
  it('accepts an explicit UTC instant', () => {
    expect(utcInstantSchema.parse('2026-10-14T12:30:00Z')).toBe('2026-10-14T12:30:00Z');
  });

  it('rejects naive timestamps at the boundary', () => {
    expect(utcInstantSchema.safeParse('2026-10-14T12:30:00').success).toBe(false);
  });

  it('rejects offset timestamps rather than reinterpreting them', () => {
    expect(utcInstantSchema.safeParse('2026-10-14T12:30:00+02:00').success).toBe(false);
  });

  it('accepts only an empty infrastructure request object', () => {
    expect(emptyInputSchema.safeParse({}).success).toBe(true);
    expect(emptyInputSchema.safeParse({ detail: true }).success).toBe(false);
  });
});
