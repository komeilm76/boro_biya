import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readEnvFile } from '@boro-biya/config';

export interface AuthConfig {
  secret: string;
  origin: string;
  secureCookies: boolean;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  maxAccountAttempts: number;
  maxOriginAttempts: number;
  windowSeconds: number;
  lockoutSeconds: number;
  delayMaxSeconds: number;
  recoveryEnabled: boolean;
  captchaEnabled: boolean;
}
export function readAuthConfig(env: Readonly<Record<string, string | undefined>> = process.env): AuthConfig {
  const file = resolve('.env');
  const source = { ...(existsSync(file) ? readEnvFile(file) : {}), ...env };
  const secret = source['SESSION_SECRET'];
  const origin = source['WEB_ORIGIN'];
  if (secret === undefined || secret.startsWith('<') || Buffer.byteLength(secret) < 32)
    throw new Error('SESSION_SECRET must contain at least 32 bytes');
  let url: URL;
  try {
    url = new URL(origin ?? '');
  } catch {
    throw new Error('WEB_ORIGIN must be an explicit HTTP(S) origin');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin)
    throw new Error('WEB_ORIGIN must be a bare HTTP(S) origin');
  const production = source['NODE_ENV'] === 'production';
  if (production && url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('production authentication requires HTTPS');
  const number = (key: string, fallback: number, max: number): number => {
    const value = source[key] === undefined ? fallback : Number(source[key]);
    if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`invalid ${key}`);
    return value;
  };
  const recovery = source['SECURITY_QUESTIONS_ENABLED'] ?? 'true';
  if (!['true', 'false'].includes(recovery)) throw new Error('invalid SECURITY_QUESTIONS_ENABLED');
  const captcha = source['CAPTCHA_ENABLED'] ?? 'false';
  if (!['true', 'false'].includes(captcha)) throw new Error('invalid CAPTCHA_ENABLED');
  return {
    secret,
    origin: url.origin,
    secureCookies: url.protocol === 'https:',
    accessTtlSeconds: number('ACCESS_TOKEN_TTL_SECONDS', 900, 900),
    refreshTtlSeconds: number('REFRESH_TOKEN_TTL_DAYS', 30, 90) * 86_400,
    maxAccountAttempts: number('LOGIN_MAX_ATTEMPTS_PER_ACCOUNT', 10, 100),
    maxOriginAttempts: number('LOGIN_MAX_ATTEMPTS_PER_ORIGIN', 30, 300),
    windowSeconds: number('LOGIN_WINDOW_SECONDS', 900, 3_600),
    lockoutSeconds: number('LOCKOUT_SECONDS', 900, 3_600),
    delayMaxSeconds: number('LOGIN_DELAY_MAX_SECONDS', 30, 30),
    recoveryEnabled: recovery === 'true',
    captchaEnabled: captcha === 'true',
  };
}
