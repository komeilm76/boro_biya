import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  adminAuditQuerySchema,
  adminStateSchema,
  adminUsersQuerySchema,
  securityReportSchema,
  compileContractAssertion,
  contractText,
  contractUtcBefore,
  restoreContractRules,
  CONTRACT_RULES,
} from '../../src/index.js';

// Independently retained pre-profile validators; do not derive these from descriptors.
const oldReason = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((text) => !/\p{Cc}/u.test(text));
const oldReport = z
  .string()
  .trim()
  .min(20)
  .max(4000)
  .refine((text) => [...text].length >= 20)
  .refine((text) =>
    [...text].every((character) => {
      const code = character.codePointAt(0)!;
      return code !== 127 && (code >= 32 || [9, 10, 13].includes(code));
    }),
  );
const oldUsername = z
  .string()
  .trim()
  .max(256)
  .transform((text) => text.normalize('NFKC').toLowerCase())
  .pipe(
    z
      .string()
      .min(1)
      .refine((text) => [...text].length <= 64 && !/[\p{Cc}\p{Cf}]/u.test(text)),
  );
const reason = adminStateSchema.shape.reason;
const report = securityReportSchema.shape.message;
const username = adminUsersQuerySchema.shape.username.unwrap();
const comparison = (schema: z.ZodType, value: unknown) => {
  const result = schema.safeParse(value);
  return result.success ? { success: true, data: result.data } : { success: false };
};

describe('mandatory contract semantic profile', () => {
  it('preserves legacy text acceptance and parsed output across boundaries and Unicode', () => {
    const values: unknown[] = [
      null,
      undefined,
      0,
      false,
      {},
      [],
      '',
      ' ',
      '  ALICE  ',
      'ＡＬＩＣＥ',
      'İ',
      'Straße',
      'K',
      '\u200d',
      '\ud800',
      '  نام کاربر  ',
      'a\nb',
      'a\tb',
      'a\rb',
    ];
    for (const length of [1, 19, 20, 63, 64, 65, 255, 256, 257, 499, 500, 501, 3999, 4000, 4001]) {
      for (const character of ['x', '😀', 'ﬃ', 'İ'])
        values.push(character.repeat(length), `  ${character.repeat(length)}  `);
    }
    for (let code = 0; code <= 0xffff; code++) {
      const text = String.fromCharCode(code);
      values.push(`a${text}b`);
    }
    for (const [before, after] of [
      [oldReason, reason],
      [oldReport, report],
      [oldUsername, username],
    ] as const) {
      const assertion = compileContractAssertion(after.meta()?.[CONTRACT_RULES]);
      for (const value of values) {
        const expected = comparison(before, value);
        expect(comparison(after, value)).toEqual(expected);
        expect(assertion(value)).toBe(expected.success);
      }
    }
  }, 30_000);

  it('compares UTC instants without millisecond rounding, with strict sibling boundaries', () => {
    const oracle = (fraction: string) => BigInt(fraction.padEnd(9, '0'));
    const prefix = '2026-10-17T12:00:00';
    const fractions = ['', '0', '000', '000000000', '000000001', '001', '001000001', '01', '1', '10', '999999999'];
    const assertOrder = compileContractAssertion(adminAuditQuerySchema.meta()?.[CONTRACT_RULES]);
    for (const from of fractions)
      for (const to of fractions) {
        const query = { from: `${prefix}${from ? '.' + from : ''}Z`, to: `${prefix}${to ? '.' + to : ''}Z` };
        const expected = oracle(from) < oracle(to);
        expect(adminAuditQuerySchema.safeParse(query).success).toBe(expected);
        expect(assertOrder(query)).toBe(expected);
      }
    for (const query of [{}, { from: prefix + 'Z' }, { to: prefix + '.000000001Z' }]) {
      expect(adminAuditQuerySchema.parse(query)).toEqual(query);
      expect(assertOrder(query)).toBe(true);
    }
    for (const query of [null, 1, { from: null }, { to: 'bad' }, { from: '2025-02-29T00:00:00Z' }]) {
      expect(assertOrder(query)).toBe(false);
      expect(adminAuditQuerySchema.safeParse(query).success).toBe(false);
    }
    expect(adminAuditQuerySchema.safeParse({ extra: true }).success).toBe(false);
    expect(adminUsersQuerySchema.safeParse({ username: 'Alice', extra: true }).success).toBe(false);
  });

  it('restores nested nullable/optional/array codecs without mutating the generated base', () => {
    const profile = username.meta()?.[CONTRACT_RULES];
    const base = z.strictObject({
      names: z
        .array(
          z
            .string()
            .meta({ [CONTRACT_RULES]: profile })
            .nullable(),
        )
        .optional(),
    });
    const restored = restoreContractRules(base);
    expect(restored.parse({ names: ['  ＡＬＩＣＥ ', null] })).toEqual({ names: ['alice', null] });
    expect(base.parse({ names: ['  ＡＬＩＣＥ ', null] })).toEqual({ names: ['  ＡＬＩＣＥ ', null] });
    expect(restored.safeParse({ names: ['\u200d'] }).success).toBe(false);
    expect(restoreContractRules(username)).toBe(username);
    const ordering = restoreContractRules(
      z
        .strictObject({ from: z.string(), to: z.string() })
        .meta({ [CONTRACT_RULES]: adminAuditQuerySchema.meta()?.[CONTRACT_RULES] }),
    );
    expect(
      ordering.safeParse({ from: '2026-01-01T00:00:00.000000002Z', to: '2026-01-01T00:00:00.000000001Z' }).success,
    ).toBe(false);
  });

  it('executes declared unknown-key stripping at every object level', () => {
    const annotation = { [CONTRACT_RULES]: { version: 1, kind: 'strip-unknown' } };
    const generated = z.looseObject({ nested: z.looseObject({ value: z.string() }).meta(annotation) }).meta(annotation);
    const restored = restoreContractRules(generated);
    expect(restored.parse({ nested: { value: 'kept', removed: 1 }, removed: 2 })).toEqual({
      nested: { value: 'kept' },
    });
    const assertion = compileContractAssertion(annotation[CONTRACT_RULES]);
    for (const value of [null, [], 1, '', false]) expect(assertion(value)).toBe(false);
    expect(assertion({ extra: true })).toBe(true);
  });

  it('fails closed on unknown versions, instructions, shapes and hidden extra checks', () => {
    for (const profile of [
      null,
      {},
      { version: 2, kind: 'text', steps: [{ op: 'trim' }] },
      { version: 1, kind: 'text', steps: [{ op: 'eval', value: 'not executable' }] },
      { version: 1, kind: 'text', steps: [{ op: 'trim', extra: true }] },
      { version: 1, kind: 'text', steps: [{ op: 'max', value: 4097 }] },
      { version: 1, kind: 'utc-before', from: 'other', to: 'to' },
    ]) {
      expect(() => compileContractAssertion(profile)).toThrow();
      expect(() => restoreContractRules(z.string().meta({ [CONTRACT_RULES]: profile }))).toThrow();
    }
    const text = username.meta()?.[CONTRACT_RULES];
    const utc = adminAuditQuerySchema.meta()?.[CONTRACT_RULES];
    expect(() => restoreContractRules(z.number().meta({ [CONTRACT_RULES]: text }))).toThrow(/structural string/);
    expect(() =>
      restoreContractRules(
        z
          .string()
          .min(2)
          .meta({ [CONTRACT_RULES]: text }),
      ),
    ).toThrow(/structural string/);
    expect(() => restoreContractRules(z.string().meta({ [CONTRACT_RULES]: utc }))).toThrow(/requires an object/);
    expect(() =>
      restoreContractRules(
        z
          .object({})
          .refine(() => true)
          .meta({ [CONTRACT_RULES]: utc }),
      ),
    ).toThrow(/unregistered checks/);
    expect(Object.isFrozen(text)).toBe(true);
    const codec = contractText({ version: 1, kind: 'text', steps: [{ op: 'trim' }] });
    expect(codec.parse(' a ')).toBe('a');
    expect(contractUtcBefore(z.strictObject({})).parse({})).toEqual({});
  });
});
