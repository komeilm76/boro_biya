import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  securityStreamQuerySchema,
  securityStreamResumeSchema,
  restoreContractRules,
  compileContractAssertion,
  CONTRACT_RULES,
} from '../../src/index.js';

// Independently retained original query + imperative route checks. In particular,
// the old general UUID parser accepted uppercase, but the HTTP route never did.
const previousQuery = z.strictObject({ ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/), after: z.uuidv7().optional() });
function previous(query: unknown, last: unknown) {
  const parsed = previousQuery.safeParse(query);
  if (
    !parsed.success ||
    (last !== undefined &&
      (typeof last !== 'string' || (parsed.data.after !== undefined && parsed.data.after !== last)))
  )
    return { success: false };
  const cursor = last ?? parsed.data.after;
  if (cursor !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(cursor))
    return { success: false };
  return { success: true, data: { query: parsed.data, cursor } };
}
function current(query: unknown, lastEventId: unknown) {
  const parsed = securityStreamQuerySchema.safeParse(query);
  if (!parsed.success) return { success: false };
  const resume = securityStreamResumeSchema.safeParse({ after: parsed.data.after, lastEventId });
  return resume.success
    ? { success: true, data: { query: parsed.data, cursor: resume.data.lastEventId ?? resume.data.after } }
    : { success: false };
}
const id = '01902c60-0000-7000-8000-000000000001';
const other = '01902c60-0000-7000-8000-000000000002';
const values: unknown[] = [
  undefined,
  null,
  '',
  id,
  other,
  id.toUpperCase(),
  ' ' + id,
  id + ' ',
  id + ', ' + other,
  'bad',
  0,
  [],
  [id],
];

describe('SSE resume admission fidelity', () => {
  it('preserves original whole-route acceptance and successful cursor output', () => {
    const queries: unknown[] = [null, [], {}, { ticket: 'bad' }, { ticket: 'T'.repeat(43), extra: true }];
    for (const after of values) queries.push({ ticket: 'T'.repeat(43), after });
    for (const query of queries) for (const last of values) expect(current(query, last)).toEqual(previous(query, last));
    expect(previousQuery.safeParse({ ticket: 'T'.repeat(43), after: id.toUpperCase() }).success).toBe(true);
    expect(current({ ticket: 'T'.repeat(43), after: id.toUpperCase() }, undefined).success).toBe(false);
  });
  it('restores the finite matching rule and rejects unknown or additional execution', () => {
    const profile = securityStreamResumeSchema.meta()?.[CONTRACT_RULES];
    const native = restoreContractRules(
      z
        .strictObject({ after: z.string().optional(), lastEventId: z.string().optional() })
        .meta({ [CONTRACT_RULES]: profile }),
    );
    const assertion = compileContractAssertion(profile);
    for (const after of [undefined, id, other])
      for (const lastEventId of [undefined, id, other]) {
        const data = { after, lastEventId };
        const expected = after === undefined || lastEventId === undefined || after === lastEventId;
        expect(native.safeParse(data).success).toBe(expected);
        expect(assertion(data)).toBe(expected);
      }
    for (const value of [null, [], 0, '', { after: 1 }, { lastEventId: null }]) expect(assertion(value)).toBe(false);
    expect(() =>
      restoreContractRules(
        z
          .object({})
          .refine(() => true)
          .meta({ [CONTRACT_RULES]: profile }),
      ),
    ).toThrow(/unregistered checks/);
    expect(() => compileContractAssertion({ version: 1, kind: 'matching-cursors', ignoreCase: true })).toThrow();
  });
});
