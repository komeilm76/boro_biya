import { z } from 'zod';

// Generate escaped numeric ranges: no control characters in source, no RegExp flags
// whose meaning could be dropped during conversion. All bounds are fixed constants.
const range = (from: number, to: number) =>
  `\\u${from.toString(16).padStart(4, '0')}-\\u${to.toString(16).padStart(4, '0')}`;

export const administrativeReasonPattern = new RegExp(`^[^${range(0, 31)}${range(127, 159)}]*$`);
export const securityReportPattern = new RegExp(`^[^${range(0, 8)}${range(11, 12)}${range(14, 31)}\\u007f]*$`);

/** Post-trim administrative prose: Unicode Cc is exactly these BMP ranges. */
export const administrativeReasonContentSchema = z.string().min(1).max(500).regex(administrativeReasonPattern);

/** Post-trim report prose: HT/LF/CR are allowed; other C0 controls and DEL are not.
 * The pinned Zod string bounds count code points, as does PostgreSQL char_length.
 * Patterns deliberately need no RegExp flags, which JSON Schema cannot transport.
 */
export const securityReportContentSchema = z.string().min(20).max(4000).regex(securityReportPattern);
