/**
 * `.env.example` carries `<placeholder>` values only (documentation gate check 7). A value that
 * still has that shape at startup means the template was copied without being filled in, so the
 * loader reports it as a distinct, actionable problem instead of a confusing type error
 * (OPS-53: startup fails with clear, non-secret diagnostics).
 */
export const PLACEHOLDER_PATTERN = /^<[^>]*>$/;

export function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERN.test(value.trim());
}
