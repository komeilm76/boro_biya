import type { CorrelationId } from './correlation.js';

/** Stable codes returned to callers; internal exception details stay in server logs. */
export type ErrorCode = 'BAD_REQUEST' | 'NOT_FOUND' | 'NOT_READY' | 'INTERNAL_ERROR';

/** Public error envelope shared by the core API and first-party services. */
export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    correlationId: CorrelationId;
  };
}

/** Builds a public error response without copying untrusted exception text. */
export function makeErrorEnvelope(
  code: ErrorCode,
  message: string,
  correlationId: CorrelationId,
): ErrorEnvelope {
  return { error: { code, message, correlationId } };
}
