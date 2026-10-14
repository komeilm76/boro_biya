import { z } from 'zod';

/**
 * Correlation and request identifiers (SEC-73, API-11). One identifier is created at the edge of
 * a user action and travels through every service hop, log line, and error envelope. Incoming
 * values are accepted only in this bounded, URL-safe shape so a hostile client cannot smuggle
 * log-injection payloads or unbounded strings through the header (API-22: allowlisted, bounded).
 */
export const correlationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{7,63}$/;

export const correlationIdSchema = z
  .string()
  .regex(correlationIdPattern, 'identifier must be 8-64 URL-safe characters (letters, digits, ".", "_", "-")');

export type CorrelationId = z.infer<typeof correlationIdSchema>;
