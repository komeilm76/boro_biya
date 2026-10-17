import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as auth from '../../src/auth.js';
import { uuidV7Schema } from '../../src/uuid.js';

const original = z.uuidv7();
describe('portable authentication UUIDv7 validation', () => {
  it('retains acceptance and exact output across versions, variants and malformed inputs', () => {
    const id = '019abcde-abcd-7abc-8abc-0123456789ab';
    const values: unknown[] = [
      id,
      id.toUpperCase(),
      null,
      undefined,
      1,
      {},
      [],
      '',
      id + '\n',
      id + '\r',
      ' ' + id,
      id + ' ',
      `{${id}}`,
      id.replaceAll('-', ''),
      '00000000-0000-0000-0000-000000000000',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
    ];
    for (const version of '0123456789abcdef')
      for (const variant of '0123456789abcdef')
        values.push(id.slice(0, 14) + version + id.slice(15, 19) + variant + id.slice(20));
    for (let index = 0; index < id.length; index++) values.push(id.slice(0, index) + 'x' + id.slice(index + 1));
    for (const value of values) {
      const expected = original.safeParse(value),
        result = uuidV7Schema.safeParse(value);
      expect(result.success).toBe(expected.success);
      if (result.success && expected.success) expect(result.data).toBe(expected.data);
    }
  });
  it('uses the shared pattern rather than lossy versioned uuid formats throughout auth schemas', () => {
    const seen = new WeakSet<object>();
    let found = false;
    function visit(value: unknown): void {
      if (!value || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      if (value === uuidV7Schema) found = true;
      const candidate = value as { _zod?: { def: { type?: string; format?: string; version?: unknown } } };
      const definition = candidate._zod?.def;
      if (definition) {
        expect(definition.type === 'string' && definition.format === 'uuid' && definition.version !== undefined).toBe(
          false,
        );
        visit(definition);
      } else for (const child of Object.values(value)) visit(child);
    }
    visit(auth);
    expect(found).toBe(true);
    expect(auth.accountResponseSchema.shape.id).toBe(uuidV7Schema);
    expect(auth.sessionListResponseSchema.element.shape.familyId).toBe(uuidV7Schema);
    expect(auth.adminIdSchema.shape.id).toBe(uuidV7Schema);
    expect(auth.securityNoticeEventSchema.shape.id).toBe(uuidV7Schema);
  });
});
