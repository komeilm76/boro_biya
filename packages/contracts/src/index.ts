// Shared API DTOs, stable identifiers, and constants (OPS-33). This package is consumed by the
// frontend, so it never contains server-only code or secrets (OPS-41), and it carries no runtime
// dependency beyond the shared validation schemas its types are inferred from (GOV-58).
export * from './error-envelope.js';
export * from './headers.js';
export * from './routes.js';
export type {
  CorrelationId,
  CursorPageMeta,
  CursorPageQuery,
  ErrorCode,
  HealthResponse,
  IdempotencyKey,
  ReadyResponse,
  RetryAfterSeconds,
  ServiceName,
  UtcDate,
  UtcInstant,
  WebClientConfig,
} from '@boro-biya/validation';
export { SERVICE_NAMES, nowUtcInstant, toUtcInstant } from '@boro-biya/validation';
