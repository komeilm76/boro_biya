import { z } from 'zod';

/**
 * Cursor pagination (API-12): opaque cursors, no offsets. Limits are always bounded server-side;
 * the default is part of the contract and stated in the OpenAPI document once endpoints exist
 * (Phase 2). Cursors are bounded strings so a hostile client cannot send unbounded values.
 */
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export const cursorSchema = z.string().min(1).max(512);

export const pageLimitSchema = z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT);

export const cursorPageQuerySchema = z.object({
  cursor: cursorSchema.optional(),
  limit: pageLimitSchema.default(DEFAULT_PAGE_LIMIT),
});

export type CursorPageQuery = z.infer<typeof cursorPageQuerySchema>;

export const cursorPageMetaSchema = z.object({
  nextCursor: cursorSchema.nullable(),
});

export type CursorPageMeta = z.infer<typeof cursorPageMetaSchema>;
