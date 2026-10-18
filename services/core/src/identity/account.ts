/** Core account entity (AUTH-09, AUTH-27, AUTH-31 … AUTH-35, ADR-019).
 * No password hash is part of the public account projection.
 */
export type AccountStatus = 'active' | 'locked' | 'banned' | 'deactivated';

export interface Account {
  id: string;
  username: string;
  status: AccountStatus;
  passwordSetupRequired: boolean;
  securitySetupRequired: boolean;
}

export const USERNAME_NORMALIZATION_VERSION = 1;

/** NFKC, surrounding whitespace removal, locale-independent Unicode lowercasing.
 * Internal whitespace, control/format characters and punctuation are rejected. Persian
 * letters and combining marks are supported; this does not merge lookalike scripts.
 * Bounds are checked before and after normalization so compatibility expansion is bounded.
 */
export function normalizeUsername(input: string): { display: string; normalized: string; version: number } {
  if (input.length > 256) throw new Error('invalid username');
  const display = input.normalize('NFKC').trim();
  const normalized = display.toLowerCase();
  for (const value of [display, normalized]) {
    const length = [...value].length;
    if (length < 3 || length > 64 || !/^[\p{L}\p{N}][\p{L}\p{N}\p{M}_-]*$/u.test(value)) {
      throw new Error('invalid username');
    }
  }
  return { display, normalized, version: USERNAME_NORMALIZATION_VERSION };
}

/** State and setup are orthogonal. This is a domain predicate, not route authorisation.
 * An expired lock still needs an atomic persisted transition before session issuance.
 */
export function canIssueSession(account: Account): boolean {
  return account.status === 'active' && !account.passwordSetupRequired && !account.securitySetupRequired;
}
