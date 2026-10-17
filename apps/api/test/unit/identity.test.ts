import { describe, expect, it } from 'vitest';
import { canIssueSession, normalizeUsername, type Account, type AccountStatus } from '../../src/identity/account.js';

describe('identity normalization (AUTH-09, AUTH-39)', () => {
  it('normalizes compatibility forms, case and surrounding whitespace deterministically', () => {
    expect(normalizeUsername('  Ａlice  ')).toEqual({ display: 'Alice', normalized: 'alice', version: 1 });
    expect(normalizeUsername('علی')).toEqual({ display: 'علی', normalized: 'علی', version: 1 });
    expect(normalizeUsername('A\u0301lice').normalized).toBe('álice');
    expect(normalizeUsername('alice_01-2').normalized).toBe('alice_01-2');
  });
  it.each([
    'ab',
    'a'.repeat(65),
    'x'.repeat(257),
    'a b',
    'a\nb',
    'a\0b',
    'a@b',
    'a.b',
    'a\u200db',
    '_abc',
    '\u0301abc',
  ])('rejects invalid input %j', (input) => {
    expect(() => normalizeUsername(input)).toThrow('invalid username');
  });
  it('counts Unicode code points rather than UTF-16 code units', () => {
    expect(normalizeUsername('𐐀'.repeat(64)).normalized).toBe('𐐨'.repeat(64));
  });
});

describe('session eligibility state × setup matrix (AUTH-27, AUTH-31 … AUTH-35)', () => {
  const states: AccountStatus[] = ['active', 'locked', 'banned', 'deactivated'];
  for (const status of states) {
    for (const passwordSetupRequired of [false, true]) {
      for (const securitySetupRequired of [false, true]) {
        it(`${status}, password setup ${passwordSetupRequired}, security setup ${securitySetupRequired}`, () => {
          const account: Account = {
            id: 'test',
            username: 'alice',
            status,
            passwordSetupRequired,
            securitySetupRequired,
          };
          expect(canIssueSession(account)).toBe(
            status === 'active' && !passwordSetupRequired && !securitySetupRequired,
          );
        });
      }
    }
  }
});
