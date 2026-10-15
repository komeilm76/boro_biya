import { errorEnvelopeSchema, type ErrorEnvelope, type FieldIssue } from '@boro-biya/validation';

/**
 * Stable, machine-readable error codes (API-11, API-37). Clients render user-facing text from
 * these codes via their own message catalogues; the `message` field of an envelope is an English
 * diagnostic fallback and safe-by-construction text, never a stack trace or database detail
 * (SEC-49). New codes are added here in the change that introduces the failure mode.
 */
export const ERROR_CODES = {
  notFound: 'not_found',
  internal: 'internal_error',
  badRequest: 'bad_request',
  validationFailed: 'validation_failed',
  payloadTooLarge: 'payload_too_large',
  unsupportedMediaType: 'unsupported_media_type',
  serviceUnavailable: 'service_unavailable',
  badGateway: 'bad_gateway',
  gatewayTimeout: 'gateway_timeout',
  requestTimeout: 'request_timeout',
  unauthorized: 'unauthorized',
  forbidden: 'forbidden',
  conflict: 'conflict',
  tooManyRequests: 'too_many_requests',
} as const;

export type StableErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** The generic message for a server-side failure: informative, safe, no internals (SEC-49). */
export const INTERNAL_ERROR_MESSAGE =
  'The service could not process this request. The team can look it up by the request identifier.';

export interface BuildErrorEnvelopeInput {
  code: string;
  message: string;
  requestId: string;
  details?: FieldIssue[];
}

/**
 * Build an envelope and validate it against the shared schema before it is returned, so a
 * malformed envelope is a build-time test failure instead of a wire surprise (fail closed).
 */
export function buildErrorEnvelope(input: BuildErrorEnvelopeInput): ErrorEnvelope {
  return errorEnvelopeSchema.parse(input);
}

export type { ErrorEnvelope, FieldIssue };
