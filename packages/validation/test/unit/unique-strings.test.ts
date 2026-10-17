import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { adminRoleAssignmentSchema, adminRoleCreateSchema, adminRoleUpdateSchema } from '../../src/auth.js';

const oldIds = z
  .array(z.uuidv7())
  .max(20)
  .refine((ids) => new Set(ids).size === ids.length);
const oldKeys = z
  .array(z.string().regex(/^[a-z]+\.[a-z]+$/))
  .max(50)
  .refine((keys) => new Set(keys).size === keys.length);

describe('portable unique string arrays retain runtime acceptance', () => {
  it('retains UUIDv7, case-sensitive uniqueness, order and the twenty-role bound', () => {
    const schema = adminRoleAssignmentSchema.shape.roleIds;
    const id = '019abcde-abcd-7abc-8abc-000000000001';
    const ids = Array.from(
      { length: 21 },
      (_, index) => `019abcde-abcd-7abc-8abc-${index.toString(16).padStart(12, '0')}`,
    );
    for (const value of [
      [],
      [id],
      [id, id],
      [id, id.toUpperCase()],
      ids.slice(0, 20),
      ids,
      null,
      {},
      [null],
      [0],
      [''],
      [id + '\n'],
    ]) {
      const expected = oldIds.safeParse(value);
      const result = schema.safeParse(value);
      expect(result.success).toBe(expected.success);
      if (result.success && expected.success) expect(result.data).toEqual(expected.data);
    }
    for (const version of '0123456789abcdef')
      for (const variant of '0123456789abcdef') {
        const candidate = id.slice(0, 14) + version + id.slice(15, 19) + variant + id.slice(20);
        expect(schema.safeParse([candidate]).success).toBe(oldIds.safeParse([candidate]).success);
      }
    expect(schema.meta()).toEqual({ uniqueItems: true });
  });
  it('retains permission-key validation, order, uniqueness and the fifty-key bound', () => {
    const keys = Array.from({ length: 51 }, (_, index) => `users.${'a'.repeat(index + 1)}`);
    for (const schema of [adminRoleCreateSchema.shape.permissions, adminRoleUpdateSchema.shape.permissions]) {
      for (const value of [
        [],
        ['users.read'],
        ['users.read', 'users.write'],
        ['users.read', 'users.read'],
        ['Users.read'],
        ['users.read\n'],
        keys.slice(0, 50),
        keys,
        [null],
        null,
      ]) {
        const expected = oldKeys.safeParse(value);
        const result = schema.safeParse(value);
        expect(result.success).toBe(expected.success);
        if (result.success && expected.success) expect(result.data).toEqual(expected.data);
      }
      expect(schema.meta()).toEqual({ uniqueItems: true });
    }
  });
});
