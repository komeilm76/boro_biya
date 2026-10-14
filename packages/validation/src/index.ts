import { parseUtcInstant } from '@boro/contracts';
import { z } from 'zod';

/** Zod contract for an explicit UTC instant on the wire (API-36). */
export const utcInstantSchema = z.string().transform((value, context) => {
  try {
    return parseUtcInstant(value);
  } catch {
    context.addIssue({ code: 'custom', message: 'Expected an RFC 3339 UTC instant ending in Z' });
    return z.NEVER;
  }
});

/** Strict empty input for infrastructure health routes. */
export const emptyInputSchema = z.object({}).strict();
