import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { adminStateSchema, securityReportSchema } from '../../src/auth.js';

// Independent copies of the previous validators: keep normalization/output checks,
// not just a second call through the new post-trim schemas.
const previousReason = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => !/\p{Cc}/u.test(value));
const previousReport = z
  .string()
  .trim()
  .min(20)
  .max(4000)
  .refine((value) => Array.from(value).length >= 20)
  .refine((value) =>
    Array.from(value).every((character) => {
      const code = character.codePointAt(0)!;
      return code !== 127 && (code >= 32 || [9, 10, 13].includes(code));
    }),
  );

function compare(value: unknown) {
  for (const [old, current] of [
    [previousReason, adminStateSchema.shape.reason],
    [previousReport, securityReportSchema.shape.message],
  ] as const) {
    const expected = old.safeParse(value),
      result = current.safeParse(value);
    expect(result.success).toBe(expected.success);
    if (expected.success && result.success) expect(result.data).toBe(expected.data);
  }
}
describe('portable text content preserves the previous full normalization pipeline', () => {
  it('retains every BMP character decision inside prose, including isolated surrogates', () => {
    for (let code = 0; code <= 0xffff; code++) {
      compare(`An invented report ${String.fromCharCode(code)} with details.`);
    }
  });
  it('retains trimming, controls at boundaries, astral/code-point bounds and invalid types', () => {
    for (const value of [
      null,
      undefined,
      {},
      [],
      12,
      false,
      '',
      '  ',
      '\t\r\n',
      '\ufeff',
      'text',
      '  reason  ',
      'x'.repeat(19),
      'x'.repeat(20),
      'x'.repeat(500),
      'x'.repeat(501),
      'x'.repeat(4000),
      'x'.repeat(4001),
      '😀'.repeat(10),
      '😀'.repeat(19),
      '😀'.repeat(20),
      '😀'.repeat(500),
      '😀'.repeat(501),
      '😀'.repeat(4000),
      '😀'.repeat(4001),
      '\ud800',
      '\udc00',
      'متن آزمایشی برای گزارش بدون اطلاعات واقعی',
    ])
      compare(value);
    for (let code = 0; code <= 0x9f; code++) {
      const character = String.fromCharCode(code);
      compare(character + 'An invented report with details.');
      compare('An invented report with details.' + character);
    }
  });
});
