import { describe, expect, it } from 'vitest';
import { createLogger, type LoggerOptions } from '../../src/logger.js';
import { utcInstantSchema } from '@boro-biya/validation';

function capturing(options: Partial<LoggerOptions> = {}) {
  const raw: string[] = [];
  const logger = createLogger({
    service: 'api',
    version: '0.1.0',
    commit: 'abc1234',
    level: 'debug',
    ...options,
    sink: (line) => raw.push(line),
  });
  return {
    logger,
    raw,
    lines: () => raw.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

describe('createLogger — structured JSON logging (SEC-57)', () => {
  it('emits one JSON object per line with the contract fields', () => {
    const capture = capturing();
    capture.logger.info('service started', { port: 3000 });
    const [line] = capture.lines();
    expect(line).toBeDefined();
    expect(line?.['level']).toBe('info');
    expect(line?.['msg']).toBe('service started');
    expect(line?.['service']).toBe('api');
    expect(line?.['version']).toBe('0.1.0');
    expect(line?.['commit']).toBe('abc1234');
    expect(line?.['port']).toBe(3000);
    expect(utcInstantSchema.safeParse(line?.['time']).success).toBe(true); // log timestamps honour API-36
  });

  it('gates by level', () => {
    const capture = capturing({ level: 'warn' });
    capture.logger.debug('hidden');
    capture.logger.info('hidden too');
    capture.logger.warn('visible');
    capture.logger.error('visible too');
    expect(capture.lines().map((line) => line['level'])).toEqual(['warn', 'error']);
  });

  it('redacts sensitive context before it reaches the sink (PRIV-10)', () => {
    const capture = capturing();
    capture.logger.info('login attempt', { userPassword: 'hunter2', attempt: 3, location: { lat: 1, lng: 2 } });
    const [line] = capture.lines();
    expect(line?.['userPassword']).toBe('[redacted]');
    expect(line?.['attempt']).toBe(3);
    expect(line?.['location']).toBe('[redacted]');
    expect(capture.raw.join('')).not.toContain('hunter2');
  });

  it('binds correlation identifiers through child loggers (SEC-73)', () => {
    const capture = capturing();
    capture.logger.child({ correlationId: '7c9e6679-7425-40de-944b-e07fc1f90ae7' }).info('request completed');
    expect(capture.lines()[0]?.['correlationId']).toBe('7c9e6679-7425-40de-944b-e07fc1f90ae7');
  });

  it('protects reserved fields from context overwrites', () => {
    const capture = capturing();
    capture.logger.info('real message', { service: 'evil', msg: 'forged', level: 'debug', time: 'yesterday' });
    const [line] = capture.lines();
    expect(line?.['service']).toBe('api');
    expect(line?.['msg']).toBe('real message');
    expect(line?.['level']).toBe('info');
    expect(line?.['time']).not.toBe('yesterday');
  });

  it('serializes Error context with name, message, and stack', () => {
    const capture = capturing();
    capture.logger.error('request failed', new Error('connection reset'));
    const [line] = capture.lines();
    const error = line?.['error'] as Record<string, unknown>;
    expect(error['name']).toBe('Error');
    expect(error['message']).toBe('connection reset');
    expect(typeof error['stack']).toBe('string');
  });
});
