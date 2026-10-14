import { REDACTED_FIELDS, REDACTION_MARKER } from './constants.js';

/** Pino-compatible redaction configuration shared by every service. */
export function redactionOptions(): { paths: string[]; censor: string } {
  return { paths: [...REDACTED_FIELDS], censor: REDACTION_MARKER };
}
