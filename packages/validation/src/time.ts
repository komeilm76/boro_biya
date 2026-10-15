import { z } from 'zod';

/**
 * The wire timestamp contract (API-36): every timestamp on the wire is an RFC 3339 instant
 * expressed in UTC with a "Z" suffix. Naive timestamps and non-UTC offsets are rejected at the
 * schema boundary so no client ever has to guess a timezone. Fractional seconds are permitted up
 * to nanosecond precision; consumers may truncate below millisecond precision, as RFC 3339 allows.
 */
export const utcInstantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

/** Calendar check: Date.parse silently rolls invalid dates over (30 February becomes 2 March). */
function isRealCalendarInstant(value: string): boolean {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return false;
  const date = new Date(parsed);
  const expected =
    `${value.slice(0, 4)}-${value.slice(5, 7)}-${value.slice(8, 10)}` +
    `T${value.slice(11, 13)}:${value.slice(14, 16)}:${value.slice(17, 19)}Z`;
  const actual = date.toISOString().slice(0, 19) + 'Z';
  return expected === actual;
}

export const utcInstantSchema = z
  .string()
  .regex(utcInstantPattern, 'timestamp must be an RFC 3339 UTC instant with a "Z" suffix (API-36)')
  .refine(isRealCalendarInstant, 'timestamp is not a real calendar instant');

/** An instant as it appears on the wire. */
export type UtcInstant = z.infer<typeof utcInstantSchema>;

/**
 * A calendar date with no time component (API-36): fields that carry a date without a time say so
 * explicitly by using this type instead of an instant, so a reader never mistakes one for the other.
 */
export const utcDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function isRealCalendarDate(value: string): boolean {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed)) return false;
  return new Date(parsed).toISOString().slice(0, 10) === value;
}

export const utcDateSchema = z
  .string()
  .regex(utcDatePattern, 'date must be a calendar date in YYYY-MM-DD form with no time component (API-36)')
  .refine(isRealCalendarDate, 'date is not a real calendar date');

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
