import { z } from 'zod';

/**
 * The wire timestamp contract (API-36): every timestamp on the wire is an RFC 3339 instant
 * expressed in UTC with a "Z" suffix. Naive timestamps and non-UTC offsets are rejected at the
 * schema boundary so no client ever has to guess a timezone. Fractional seconds are permitted up
 * to nanosecond precision; consumers may truncate below millisecond precision, as RFC 3339 allows.
 */
export const utcInstantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

// Native ISO validation expresses leap years, month lengths and clock bounds as portable
// pattern checks. Keep the additional wire pattern: seconds are mandatory, precision is
// bounded at nine digits and only the uppercase UTC suffix is accepted (API-08, API-36).
export const utcInstantSchema = z.iso
  .datetime()
  .regex(utcInstantPattern, 'timestamp must be an RFC 3339 UTC instant with a "Z" suffix (API-36)');

/** An instant as it appears on the wire. */
export type UtcInstant = z.infer<typeof utcInstantSchema>;

/**
 * A calendar date with no time component (API-36): fields that carry a date without a time say so
 * explicitly by using this type instead of an instant, so a reader never mistakes one for the other.
 */
export const utcDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export const utcDateSchema = z.iso
  .date()
  .regex(utcDatePattern, 'date must be a calendar date in YYYY-MM-DD form with no time component (API-36)');

/** A calendar date on the wire: no time, no timezone ambiguity. */
export type UtcDate = z.infer<typeof utcDateSchema>;

/** Serialize a Date as the wire instant. The output always carries the "Z" suffix. */
export function toUtcInstant(date: Date): UtcInstant {
  return date.toISOString();
}

/** The current time as the wire instant. */
export function nowUtcInstant(): UtcInstant {
  return toUtcInstant(new Date());
}
