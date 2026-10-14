import type { CorrelationId } from '@boro/contracts';
import type { AppLogger } from './types.js';

/** Creates a request-scoped logger without copying request payloads or identity data. */
export function withCorrelation(logger: AppLogger, correlationId: CorrelationId): AppLogger {
  return logger.child({ correlationId });
}
