import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';

/** SEC-04/SEC-05: maintained Node binding behind an app-owned adapter; no call site hashes. */
export interface PasswordHasher {
  hash(value: string): Promise<string>;
  verify(encoded: string, value: string): Promise<boolean>;
}

export function createPasswordHasher(memoryCost = 65_536, timeCost = 2, parallelism = 1): PasswordHasher {
  if (
    !Number.isInteger(memoryCost) ||
    memoryCost < 65_536 ||
    memoryCost > 262_144 ||
    !Number.isInteger(timeCost) ||
    timeCost < 2 ||
    timeCost > 10 ||
    !Number.isInteger(parallelism) ||
    parallelism < 1 ||
    parallelism > 4
  ) {
    throw new Error('invalid Argon2id resource bounds');
  }
  let active = 0;
  async function bounded<T>(operation: () => Promise<T>): Promise<T> {
    if (active >= 2) throw Object.assign(new Error('Credential service is busy.'), { statusCode: 503 });
    active++;
    try {
      return await operation();
    } finally {
      active--;
    }
  }
  return {
    async hash(value) {
      if (Buffer.byteLength(value) > 1_024) throw new Error('credential exceeds byte bound');
      return bounded(() => argon2.hash(value, { type: argon2.argon2id, memoryCost, timeCost, parallelism }));
    },
    async verify(encoded, value) {
      if (Buffer.byteLength(value) > 1_024) return false;
      // Encoded hashes are trusted server records; bound input before the native adapter.
      if (!encoded.startsWith('$argon2id$') || encoded.length > 512) return false;
      return bounded(async () => {
        try {
          return await argon2.verify(encoded, value);
        } catch {
          return false;
        }
      });
    },
  };
}

// Local initial blocklist, not an online password lookup or a claim of exhaustive coverage.
const COMMON = new Set([
  'password1234',
  'password123!',
  '123456789012',
  'qwerty123456',
  'letmein12345',
  'correcthorsebatterystaple',
]);
export function validPassword(password: string, username: string): boolean {
  const length = [...password].length;
  const lower = password.normalize('NFKC').toLowerCase();
  return (
    length >= 12 &&
    length <= 128 &&
    Buffer.byteLength(password) <= 1_024 &&
    !COMMON.has(lower) &&
    !/^(.)\1+$/u.test(password) &&
    !lower.includes(username.toLowerCase()) &&
    /\p{L}/u.test(password) &&
    /[^\p{L}]/u.test(password)
  );
}

/** SEC-06: version 1 is NFKC + trim + collapse whitespace; deliberately case-sensitive. */
export function normalizeAnswer(value: string): string {
  if (value.length > 1_024) throw new Error('invalid security answer');
  const result = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (result.length === 0 || [...result].length > 256 || /\p{Cc}/u.test(result))
    throw new Error('invalid security answer');
  return result;
}

/** Display-once, 256-bit setup credential, sampled against the same password policy. */
export function generateSetupCredential(username: string): string {
  let credential = `${randomBytes(32).toString('base64url')}!9`;
  while (!validPassword(credential, username)) credential = `${randomBytes(32).toString('base64url')}!9`;
  return credential;
}
