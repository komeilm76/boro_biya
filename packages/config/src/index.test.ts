import { describe, expect, it } from 'vitest';
import { ConfigurationError, parseConfig } from './index.js';

describe('startup configuration', () => {
  it('applies safe development defaults', () => {
    expect(parseConfig({})).toMatchObject({
      NODE_ENV: 'development',
      API_HOST: '0.0.0.0',
      API_PORT: 3000,
      DB_POOL_MAX: 10,
    });
  });

  it('coerces valid numeric environment values', () => {
    expect(parseConfig({ API_PORT: '4100', DB_POOL_MAX: '4' })).toMatchObject({
      API_PORT: 4100,
      DB_POOL_MAX: 4,
    });
  });

  it('rejects invalid ports and pool sizes', () => {
    expect(() => parseConfig({ API_PORT: '70000' })).toThrow(ConfigurationError);
    expect(() => parseConfig({ DB_POOL_MAX: '0' })).toThrow(ConfigurationError);
  });

  it('rejects a malformed database URL without disclosing its value', () => {
    try {
      parseConfig({ DATABASE_URL: 'not-a-database-url-secret' });
      throw new Error('configuration should have failed');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as Error).message).toContain('DATABASE_URL');
      expect((error as Error).message).not.toContain('not-a-database-url-secret');
    }
  });

  it('accepts a service identity from the fixed set', () => {
    expect(parseConfig({ SERVICE_NAME: 'relation' }).SERVICE_NAME).toBe('relation');
  });

  it('accepts only a valid hexadecimal commit identifier when GIT_SHA is supplied', () => {
    expect(parseConfig({ GIT_SHA: 'abcdef0' }).GIT_SHA).toBe('abcdef0');
    expect(() => parseConfig({ GIT_SHA: 'local' })).toThrow(ConfigurationError);
  });

  it('rejects an unsupported mode and log level', () => {
    expect(() => parseConfig({ NODE_ENV: 'preview' })).toThrow(ConfigurationError);
    expect(() => parseConfig({ LOG_LEVEL: 'verbose' })).toThrow(ConfigurationError);
  });
});
