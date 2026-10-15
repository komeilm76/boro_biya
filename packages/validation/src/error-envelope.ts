import { z } from 'zod';
import { correlationIdSchema } from './correlation.js';

/**
 * The single error envelope (API-11): a stable machine-readable code, a safe human-readable
 * message, optional field-level details, and the request identifier so a user report can be tied
 * to server logs (SEC-73). Per API-37 the machine-readable code drives client rendering; the
 * message is an English diagnostic fallback only.
 */
export const errorCodeSchema = z.string().regex(/^[a-z][a-z0-9_]{1,62}$/, 'error code must be stable lower_snake_case');

export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const fieldIssueSchema = z.object({
  field: z.string().min(1).max(200),
  issue: z.string().min(1).max(500),
});

export type FieldIssue = z.infer<typeof fieldIssueSchema>;

export const errorEnvelopeSchema = z.object({
  code: errorCodeSchema,
  message: z.string().min(1).max(500),
  requestId: correlationIdSchema,
  details: z.array(fieldIssueSchema).max(50).optional(),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
