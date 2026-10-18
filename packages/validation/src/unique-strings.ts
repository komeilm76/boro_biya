import { z } from 'zod';

/**
 * The same Set-equality rule used by role IDs and permission keys. Its identity lets
 * contract tooling recognize this one declarative constraint, never arbitrary refinements.
 * Apply only to string arrays carrying the matching `uniqueItems: true` metadata.
 */
export const uniqueStringItemsCheck = z.refine<string[]>((values) => new Set(values).size === values.length);
