/** A wire instant whose textual offset is explicitly UTC (`Z`). */
export type UtcInstant = string & { readonly __brand: 'UtcInstant' };

/** Error raised when a value is not an RFC 3339 UTC instant. */
export class TimestampContractError extends Error {
  public constructor() {
    super('Expected an RFC 3339 instant in UTC with a Z offset');
    this.name = 'TimestampContractError';
  }
}

const UTC_INSTANT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?Z$/;

/**
 * Parses a wire timestamp only when it is an explicit UTC instant.
 *
 * @param value - An untrusted value from a request or response payload.
 * @returns The original value branded as a UTC instant.
 * @throws {@link TimestampContractError} when the value is naive, offset, or invalid.
 * @example
 * ```ts
 * const createdAt = parseUtcInstant('2026-10-14T12:30:00.000Z');
 * ```
 */
export function parseUtcInstant(value: unknown): UtcInstant {
  if (typeof value !== 'string') throw new TimestampContractError();
  const match = UTC_INSTANT_PATTERN.exec(value);
  if (!match) throw new TimestampContractError();

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const daysInMonth = monthLengths[month - 1];

  if (
    !daysInMonth ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new TimestampContractError();
  }

  return value as UtcInstant;
}

/** Serializes a server-owned clock value as an explicit UTC wire instant. */
export function toUtcInstant(value: Date): UtcInstant {
  if (!Number.isFinite(value.getTime())) throw new TimestampContractError();
  return value.toISOString() as UtcInstant;
}
