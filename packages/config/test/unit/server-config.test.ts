import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigError, parseEnvFile, readServerConfig } from '../../src/index.js';

const VALID_BASE = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgres://boro_core:dev-only@127.0.0.1:5432/boro_biya',
};

const tempDirs: string[] = [];
function tempEnvFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'boro-config-test-'));
  tempDirs.push(dir);
  const path = join(dir, '.env');
  writeFileSync(path, content, 'utf8');
  return path;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

describe('readServerConfig — startup fails on invalid configuration (OPS-53)', () => {
  it('parses a minimal valid environment with safe defaults', () => {
    const config = readServerConfig({
      kind: 'api',
      env: { ...VALID_BASE, WEB_ORIGIN: 'http://localhost:5173' },
      envFilePath: null,
    });
    expect(config.service).toBe('api');
    expect(config.apiHost).toBe('127.0.0.1'); // safe loopback default (OPS-70)
    expect(config.apiPort).toBe(3000);
    expect(config.metricsPort).toBe(9000);
    expect(config.logLevel).toBe('info');
    expect(config.trustProxy).toBe(false);
    expect(config.corsAllowedOrigins).toEqual([]);
    expect(config.dbPoolMax).toBe(10); // bounded, never unlimited (OPS-48)
    expect(config.gracefulShutdownTimeoutSeconds).toBe(10);
  });

  it('applies per-service defaults for relation and sos', () => {
    const relation = readServerConfig({ kind: 'relation', env: VALID_BASE, envFilePath: null });
    expect(relation.apiPort).toBe(3001);
    expect(relation.metricsPort).toBe(9001);
    const sos = readServerConfig({ kind: 'sos', env: VALID_BASE, envFilePath: null });
    expect(sos.apiPort).toBe(3002);
    expect(sos.metricsPort).toBe(9002);
  });

  it('fails on a missing required variable and names it', () => {
    expect(() =>
      readServerConfig({ kind: 'api', env: { DATABASE_URL: VALID_BASE.DATABASE_URL }, envFilePath: null }),
    ).toThrowError(/NODE_ENV/);
    expect(() => readServerConfig({ kind: 'api', env: { NODE_ENV: 'development' }, envFilePath: null })).toThrowError(
      /DATABASE_URL/,
    );
  });

  it('fails on .env.example placeholders with an actionable message', () => {
    const error = catchConfigError(() =>
      readServerConfig({
        kind: 'api',
        env: {
          NODE_ENV: '<development|test|production>',
          DATABASE_URL: '<postgres://user:password@localhost:5432/db>',
        },
        envFilePath: null,
      }),
    );
    expect(error).toBeInstanceOf(ConfigError);
    expect(error?.message).toContain('placeholder');
    expect(error?.message).toContain('env:create');
    expect(error?.issues.map((issue) => issue.variable).sort()).toEqual(['DATABASE_URL', 'NODE_ENV']);
  });

  it('never echoes variable values in diagnostics (SEC-13)', () => {
    const secretValue = 'sup3r-s3cret-value-that-must-not-appear';
    const error = catchConfigError(() =>
      readServerConfig({
        kind: 'api',
        env: { ...VALID_BASE, DATABASE_URL: secretValue, WEB_ORIGIN: 'http://localhost:5173' },
        envFilePath: null,
      }),
    );
    expect(error?.message).toContain('DATABASE_URL');
    expect(error?.message).not.toContain(secretValue);
  });

  it('rejects wildcard CORS origins in every environment (SEC-44)', () => {
    expect(() =>
      readServerConfig({
        kind: 'api',
        env: { ...VALID_BASE, WEB_ORIGIN: 'http://localhost:5173', CORS_ALLOWED_ORIGINS: '*' },
        envFilePath: null,
      }),
    ).toThrowError(/wildcard/);
    expect(() =>
      readServerConfig({
        kind: 'api',
        env: { ...VALID_BASE, WEB_ORIGIN: 'http://localhost:5173', CORS_ALLOWED_ORIGINS: 'http://localhost:5173,*' },
        envFilePath: null,
      }),
    ).toThrowError(/wildcard/);
  });

  it('accepts an explicit origin list and rejects malformed entries', () => {
    const config = readServerConfig({
      kind: 'api',
      env: {
        ...VALID_BASE,
        WEB_ORIGIN: 'http://localhost:5173',
        CORS_ALLOWED_ORIGINS: 'http://localhost:5173, https://app.example',
      },
      envFilePath: null,
    });
    expect(config.corsAllowedOrigins).toEqual(['http://localhost:5173', 'https://app.example']);
    expect(() =>
      readServerConfig({
        kind: 'api',
        env: { ...VALID_BASE, WEB_ORIGIN: 'http://localhost:5173', CORS_ALLOWED_ORIGINS: 'http://localhost:5173/path' },
        envFilePath: null,
      }),
    ).toThrowError(/bare http\(s\) origin/);
  });

  it('rejects non-production URL schemes for the database', () => {
    expect(() =>
      readServerConfig({
        kind: 'api',
        env: { ...VALID_BASE, DATABASE_URL: 'mysql://user@localhost/db' },
        envFilePath: null,
      }),
    ).toThrowError(/postgres/);
  });

  it('requires WEB_ORIGIN only for the core API', () => {
    expect(() => readServerConfig({ kind: 'api', env: VALID_BASE, envFilePath: null })).toThrowError(/WEB_ORIGIN/);
    expect(() => readServerConfig({ kind: 'relation', env: VALID_BASE, envFilePath: null })).not.toThrow();
  });

  it('parses booleans strictly', () => {
    const config = readServerConfig({
      kind: 'relation',
      env: { ...VALID_BASE, TRUST_PROXY: 'TRUE' },
      envFilePath: null,
    });
    expect(config.trustProxy).toBe(true);
    expect(() =>
      readServerConfig({ kind: 'relation', env: { ...VALID_BASE, TRUST_PROXY: 'yes' }, envFilePath: null }),
    ).toThrowError(/true.*false/);
  });

  it('merges an env file under the real environment', () => {
    const path = tempEnvFile(
      'NODE_ENV=test\nDATABASE_URL=postgres://file-role:file@127.0.0.1:5432/boro_biya\nLOG_LEVEL=debug\n',
    );
    const config = readServerConfig({ kind: 'relation', env: { LOG_LEVEL: 'warn' }, envFilePath: path });
    expect(config.nodeEnv).toBe('test'); // from the file
    expect(config.logLevel).toBe('warn'); // real environment wins
    expect(config.databaseUrl).toContain('file-role');
  });
});

function catchConfigError(run: () => unknown): ConfigError | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    return error instanceof ConfigError ? error : undefined;
  }
}

describe('parseEnvFile — minimal, fail-closed .env reader', () => {
  it('reads KEY=value lines, comments, quotes, and CRLF', () => {
    const parsed = parseEnvFile(['# comment', 'A=1', '', "B='two'", 'C="three"', 'D='].join('\r\n'));
    expect(parsed).toEqual({ A: '1', B: 'two', C: 'three', D: '' });
  });

  it('rejects malformed lines and duplicate keys with line numbers', () => {
    expect(() => parseEnvFile('A=1\nnot a line\n')).toThrowError(/:2/);
    expect(() => parseEnvFile('A=1\nA=2\n')).toThrowError(/repeats key A/);
  });

  it('readEnvFile returns null for a missing file', async () => {
    const { readEnvFile } = await import('../../src/env-file.js');
    expect(readEnvFile(join(tmpdir(), 'boro-biya-does-not-exist', '.env'))).toBeNull();
    const path = tempEnvFile('A=1\n');
    expect(readEnvFile(path)).toEqual({ A: '1' });
    expect(readFileSync(path, 'utf8')).toContain('A=1');
  });
});
