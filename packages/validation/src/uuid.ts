import { z } from 'zod';

/**
 * Use the pinned Zod UUIDv7 predicate as an explicit pattern: a generic JSON Schema
 * `uuid` format alone permits other versions. No normalisation or case folding.
 */
export const uuidV7Schema = z.string().regex(z.regexes.uuid7);
