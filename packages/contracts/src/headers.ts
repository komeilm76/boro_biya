/**
 * Wire header names. Lowercase literals match HTTP/2 normalization; Node and Fastify expose
 * incoming headers lowercased. One correlation identifier per user action travels through every
 * hop under these names (SEC-73); clients surface the request identifier from error envelopes
 * and response headers when reporting a problem (API-11).
 */
export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const REQUEST_ID_HEADER = 'x-request-id';
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const RETRY_AFTER_HEADER = 'retry-after';
