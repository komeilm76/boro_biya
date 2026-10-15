import { describe, expect, it } from 'vitest';
import { errorEnvelopeSchema, healthResponseSchema, readyResponseSchema } from '@boro-biya/validation';
import {
  makeCapturedLog,
  makeCorrelationIdFixture,
  makeErrorEnvelopeFixture,
  makeHealthFixture,
  makeReadyFixture,
  makeServerConfigFixture,
} from '../../src/builders.js';

describe('shared fixtures validate against the production schemas (QA-13 fidelity)', () => {
  it('builds contract-valid fixtures', () => {
    expect(errorEnvelopeSchema.safeParse(makeErrorEnvelopeFixture()).success).toBe(true);
    expect(healthResponseSchema.safeParse(makeHealthFixture()).success).toBe(true);
    expect(readyResponseSchema.safeParse(makeReadyFixture()).success).toBe(true);
    expect(readyResponseSchema.safeParse(makeReadyFixture('unavailable', { database: false })).success).toBe(true);
  });

  it('generates correlation identifiers the wire schema accepts', () => {
    for (let index = 0; index < 10; index += 1) {
      expect(makeCorrelationIdFixture()).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it('captures log lines for assertions', () => {
    const capture = makeCapturedLog();
    capture.sink('{"msg":"first"}\n');
    capture.sink('{"msg":"second"}\n');
    expect(capture.lines().map((line) => line['msg'])).toEqual(['first', 'second']);
  });

  it('builds a complete server configuration fixture', () => {
    const config = makeServerConfigFixture({ service: 'sos' });
    expect(config.service).toBe('sos');
    expect(config.databaseUrl).toContain('127.0.0.1:1'); // deliberately unreachable
    expect(config.dbPoolMax).toBeGreaterThan(0);
  });
});
