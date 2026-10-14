import { randomUUID } from 'node:crypto';
import { CORRELATION_ID_HEADER, REQUEST_ID_HEADER } from '@boro-biya/contracts';
import { correlationIdSchema } from '@boro-biya/validation';

/**
 * Correlation identifiers (SEC-73): one identifier per user action, created at the first edge
 * (the web static server or the API), honoured when a trusted upstream already sent one, and
 * propagated on every service hop. It appears in structured logs, error envelopes (`requestId`,
 * API-11), and response headers, so one user report resolves to one trace across services.
 */
export function newCorrelationId(): string {
  return randomUUID();
}

/**
 * Validate an incoming identifier. Anything outside the bounded URL-safe shape is rejected and
 * replaced server-side, so a hostile client cannot inject log content or unbounded strings
 * (API-22). Returns null when the value must not be reused.
 */
export function sanitizeIncomingCorrelationId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const candidate = raw.trim();
  const result = correlationIdSchema.safeParse(candidate);
  return result.success ? result.data : null;
}

/** Headers an outbound service hop carries so the identifier continues across the hop. */
export function correlationHeaders(correlationId: string): Record<string, string> {
  return {
    [CORRELATION_ID_HEADER]: correlationId,
    [REQUEST_ID_HEADER]: correlationId,
  };
}

/** The pathname of a request URL, for logging without query strings (queries may carry secrets). */
export function safePathForLog(url: string): string {
  try {
    return new URL(url, 'http://request.local').pathname;
  } catch {
    return '[unparseable-path]';
  }
}
