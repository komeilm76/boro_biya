import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createCorrelationId } from '@boro/contracts';
import { createLogger, redactionOptions, withCorrelation } from './index.js';

function captureLogger(): { logger: ReturnType<typeof createLogger>; lines: string[] } {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString('utf8'));
      callback();
    },
  });
  return { logger: createLogger({ name: 'test', level: 'info', stream }), lines };
}

describe('shared structured logging', () => {
  it('redacts sensitive values before writing structured output', () => {
    const { logger, lines } = captureLogger();
    logger.info({ password: 'synthetic-placeholder', accessToken: 'synthetic-token' }, 'event');
    const record = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(record.password).toBe('[REDACTED]');
    expect(record.accessToken).toBe('[REDACTED]');
  });

  it('redacts authorization and cookie fields nested under request headers', () => {
    const { logger, lines } = captureLogger();
    logger.info({
      req: { headers: { authorization: 'synthetic-header', cookie: 'synthetic-cookie' } },
    });
    const record = JSON.parse(lines[0] ?? '{}') as { req?: { headers?: Record<string, unknown> } };
    expect(record.req?.headers?.authorization).toBe('[REDACTED]');
    expect(record.req?.headers?.cookie).toBe('[REDACTED]');
  });

  it('binds a correlation identifier without adding payload data', () => {
    const { logger, lines } = captureLogger();
    withCorrelation(logger, createCorrelationId('hop-2')).info('request completed');
    expect(lines[0]).toContain('"correlationId":"hop-2"');
  });

  it('keeps the redaction list non-empty and centrally defined', () => {
    expect(redactionOptions().paths).toContain('password');
    expect(redactionOptions().paths).toContain('req.headers.authorization');
  });
});
