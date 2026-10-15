import { z } from 'zod';

/**
 * Idempotency keys for mutating operations (API-14). Keys are client-generated, bounded, and
 * URL-safe; the store and deduplication window arrive with the first mutating endpoints in
 * Phase 2, but the wire shape is fixed here from the start so clients never change shape.
 */
export const idempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9._:-]{16,128}$/, 'idempotency key must be 16-128 URL-safe characters');

export type IdempotencyKey = z.infer<typeof idempotencyKeySchema>;

/**
 * Retry guidance (API-18): when a request may be retried, the response carries `Retry-After` in
 * whole seconds, bounded to one day so a server bug cannot tell clients to go away forever.
 */
export const retryAfterSecondsSchema = z.coerce.number().int().min(0).max(86_400);

export type RetryAfterSeconds = z.infer<typeof retryAfterSecondsSchema>;
