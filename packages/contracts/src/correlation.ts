import { randomUUID } from 'node:crypto';

/** A correlation identifier safe to copy into logs and service-to-service headers. */
export type CorrelationId = string & { readonly __brand: 'CorrelationId' };

/** Header used to carry one request identifier across service boundaries. */
export const CORRELATION_HEADER = 'x-correlation-id';

const CORRELATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/**
 * Returns a caller-supplied correlation identifier when it is safe, otherwise a new UUID.
 *
 * @param candidate - Untrusted value received from a request header.
 * @returns A bounded identifier with no whitespace or control characters.
 * @example
 * ```ts
 * const id = createCorrelationId(request.headers[CORRELATION_HEADER]);
 * ```
 */
export function createCorrelationId(candidate?: string | string[]): CorrelationId {
  const value = Array.isArray(candidate) ? candidate[0] : candidate;
  if (value && CORRELATION_PATTERN.test(value)) return value as CorrelationId;
  return randomUUID() as CorrelationId;
}

/** Checks whether an existing string can safely be used as a correlation identifier. */
export function isCorrelationId(value: unknown): value is CorrelationId {
  return typeof value === 'string' && CORRELATION_PATTERN.test(value);
}

/** Produces the header object used by an outbound service call. */
export function correlationHeaders(id: CorrelationId): Record<typeof CORRELATION_HEADER, string> {
  return { [CORRELATION_HEADER]: id };
}
