import { describe, expect, it } from 'vitest';
import { adminUsersQuerySchema, adminAuditQuerySchema } from '../../src/auth.js';
describe('bounded administrative query contracts', () => {
  it('normalizes literal Unicode username queries and retains explicit false', () => {
    expect(adminUsersQuerySchema.parse({ username: '  ＡＬＩＣＥ  ', setupRequired: 'false' })).toEqual({
      username: 'alice',
      setupRequired: 'false',
    });
    expect(adminUsersQuerySchema.parse({ username: '𐐀'.repeat(64) }).username).toBe('𐐨'.repeat(64));
    expect(adminUsersQuerySchema.parse({ username: "%_'" }).username).toBe("%_'");
  });
  it.each([
    { username: 'x'.repeat(65) },
    { username: '\ufb03'.repeat(64) },
    { username: 'a\u200db' },
    { username: 'a\u0000b' },
    { username: '' },
    { username: ['a', 'b'] },
    { status: 'deleted' },
    { setupRequired: false },
    { setupRequired: '0' },
    { injected: true },
  ])('rejects invalid user query %j', (input) => {
    expect(adminUsersQuerySchema.safeParse(input).success).toBe(false);
  });
  it('accepts open-ended and nanosecond-precision ordered UTC intervals', () => {
    expect(adminAuditQuerySchema.safeParse({ from: '2026-10-17T00:00:00Z' }).success).toBe(true);
    expect(adminAuditQuerySchema.safeParse({ to: '2026-10-17T00:00:00Z' }).success).toBe(true);
    expect(
      adminAuditQuerySchema.safeParse({ from: '2026-10-17T00:00:00.000000001Z', to: '2026-10-17T00:00:00.000000002Z' })
        .success,
    ).toBe(true);
    expect(
      adminAuditQuerySchema.safeParse({ from: '2026-10-17T00:00:00Z', to: '2026-10-17T00:00:00.000000001Z' }).success,
    ).toBe(true);
  });
  it.each([
    { from: '2026-10-17T00:00:00.1Z', to: '2026-10-17T00:00:00.10Z' },
    { from: '2026-10-18T00:00:00Z', to: '2026-10-17T00:00:00Z' },
    { from: '2026-02-30T00:00:00Z' },
    { from: '2026-10-17T00:00:00+01:00' },
    { actorId: 'invalid' },
    { action: 'a'.repeat(81) },
    { action: 'invalid action' },
    { targetType: 'invalid-type' },
    { unknown: true },
  ])('rejects invalid audit query %j', (input) => {
    expect(adminAuditQuerySchema.safeParse(input).success).toBe(false);
  });
});
