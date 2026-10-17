import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { readAuthConfig } from '../../src/auth/config.js';
import { createPasswordHasher, validPassword, normalizeAnswer } from '../../src/auth/passwords.js';
import { createAccessTokens } from '../../src/auth/tokens.js';
const env = {
  SESSION_SECRET: 'disposable-unit-only-signing-material',
  WEB_ORIGIN: 'https://example.test',
  NODE_ENV: 'test',
};

describe('authentication configuration and resource bounds', () => {
  it('reads safe defaults, explicit lifetimes and feature switches', () => {
    expect(readAuthConfig(env)).toMatchObject({
      secureCookies: true,
      accessTtlSeconds: 900,
      refreshTtlSeconds: 2592000,
    });
    expect(
      readAuthConfig({
        ...env,
        WEB_ORIGIN: 'http://localhost:8080',
        NODE_ENV: 'production',
        SECURITY_QUESTIONS_ENABLED: 'false',
        CAPTCHA_ENABLED: 'true',
      }),
    ).toMatchObject({ secureCookies: false, recoveryEnabled: false, captchaEnabled: true });
    expect(
      readAuthConfig({ ...env, ACCESS_TOKEN_TTL_SECONDS: '60', REFRESH_TOKEN_TTL_DAYS: '7' }).accessTtlSeconds,
    ).toBe(60);
  });
  it.each([
    { SESSION_SECRET: '' },
    { SESSION_SECRET: '<placeholder>' },
    { WEB_ORIGIN: 'invalid' },
    { WEB_ORIGIN: 'https://example.test/path' },
    { WEB_ORIGIN: 'http://example.test', NODE_ENV: 'production' },
    { ACCESS_TOKEN_TTL_SECONDS: '901' },
    { LOGIN_MAX_ATTEMPTS_PER_ACCOUNT: '-1' },
    { SECURITY_QUESTIONS_ENABLED: 'yes' },
    { CAPTCHA_ENABLED: 'yes' },
  ])('fails invalid settings without including values: %j', (patch) => {
    expect(() => readAuthConfig({ ...env, ...patch })).toThrow();
  });
});

describe('password and security-answer adapter', () => {
  it('uses salted Argon2id with versioned parameters and safely rejects bad verification input', async () => {
    const hasher = createPasswordHasher();
    const hash = await hasher.hash('Sailing!violet782');
    expect(hash).toMatch(/^\$argon2id\$v=19\$/);
    expect(await hasher.verify(hash, 'Sailing!violet782')).toBe(true);
    expect(await hasher.verify(hash, 'wrong')).toBe(false);
    expect(await hasher.verify('$argon2id$malformed', 'test')).toBe(false);
    expect(await hasher.verify('plaintext', 'test')).toBe(false);
    expect(await hasher.verify('$argon2id$' + 'x'.repeat(513), 'test')).toBe(false);
    expect(await hasher.verify(hash, 'x'.repeat(1025))).toBe(false);
    await expect(hasher.hash('x'.repeat(1025))).rejects.toThrow('byte bound');
  });
  it('bounds native hashing concurrency and recovers capacity after completion', async () => {
    const hasher = createPasswordHasher();
    const first = hasher.hash('concurrent first 77!');
    const second = hasher.hash('concurrent second 88!');
    await expect(hasher.hash('concurrent third 99!')).rejects.toMatchObject({ statusCode: 503 });
    await Promise.all([first, second]);
    expect(await hasher.hash('capacity recovered 00!')).toMatch(/^\$argon2id\$/);
  });
  it.each([
    [65535, 2, 1],
    [262145, 2, 1],
    [65536, 1, 1],
    [65536, 11, 1],
    [65536, 2, 0],
    [65536, 2, 5],
  ])('rejects invalid resource parameters', (m, t, p) => {
    expect(() => createPasswordHasher(m, t, p)).toThrow('resource bounds');
  });
  it('enforces password bounds/blocklist and preserves answer case with version-1 normalization', () => {
    expect(validPassword('Sailing!violet782', 'alice')).toBe(true);
    for (const password of [
      'short',
      'password1234',
      'a'.repeat(12),
      'alice-is-here-77',
      'longlettersonly',
      'x'.repeat(129),
    ])
      expect(validPassword(password, 'alice')).toBe(false);
    expect(normalizeAnswer('  Ａnswer  \t here ')).toBe('Answer here');
    expect(normalizeAnswer('Answer')).not.toBe(normalizeAnswer('answer'));
    for (const value of ['', ' '.repeat(10), 'a\0b', 'a'.repeat(257), 'x'.repeat(1025)])
      expect(() => normalizeAnswer(value)).toThrow();
  });
});

describe('JOSE token binding', () => {
  it('checks signature, issuer, audience, age and required session claims', async () => {
    const config = { secret: env.SESSION_SECRET, origin: env.WEB_ORIGIN, accessTtlSeconds: 900 };
    const tokens = createAccessTokens(config);
    const token = await tokens.sign('user', 'session');
    expect(await tokens.verify(token)).toEqual({ userId: 'user', sessionId: 'session' });
    expect(await tokens.verify(token + 'bad')).toBeNull();
    expect(await tokens.verify('x'.repeat(4097))).toBeNull();
    expect(await createAccessTokens({ ...config, origin: 'https://other.test' }).verify(token)).toBeNull();
    const key = new TextEncoder().encode(env.SESSION_SECRET);
    for (const claims of [{}, { sub: 'user' }, { sid: 'session' }]) {
      const malformed = await new SignJWT(claims)
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuer('boro-biya')
        .setAudience(config.origin)
        .setIssuedAt()
        .setExpirationTime('1m')
        .sign(key);
      expect(await tokens.verify(malformed)).toBeNull();
    }
    const expired = await new SignJWT({ sid: 'session' })
      .setSubject('user')
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('boro-biya')
      .setAudience(config.origin)
      .setIssuedAt(1)
      .setExpirationTime(2)
      .sign(key);
    expect(await tokens.verify(expired)).toBeNull();
    expect(() => createAccessTokens({ ...config, secret: 'short' })).toThrow();
  });
});
