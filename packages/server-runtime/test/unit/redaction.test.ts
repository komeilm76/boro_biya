import { describe, expect, it } from 'vitest';
import { isSensitiveKey, redactDeep, REDACTED } from '../../src/redaction.js';

describe('redactDeep — the single shared redaction layer (PRIV-10)', () => {
  it('redacts sensitive keys at any depth', () => {
    const input = {
      user: { id: 'u-1', password: 'hunter2', profile: { displayName: 'Sam' } },
      headers: { authorization: 'Bearer abc', 'x-correlation-id': 'safe-value' },
      sessionToken: 'tok',
      coordinates: { latitude: 35.7, longitude: 51.4 },
      payment: { cardNumber: '4111', cvv: '123' },
      answer: 'my first pet',
    };
    const output = redactDeep(input) as Record<string, unknown>;
    const user = output['user'] as Record<string, unknown>;
    expect(user['id']).toBe('u-1');
    expect(user['password']).toBe(REDACTED);
    expect((user['profile'] as Record<string, unknown>)['displayName']).toBe('Sam');
    const headers = output['headers'] as Record<string, unknown>;
    expect(headers['authorization']).toBe(REDACTED);
    expect(headers['x-correlation-id']).toBe('safe-value');
    expect(output['sessionToken']).toBe(REDACTED);
    expect(output['coordinates']).toBe(REDACTED);
    expect(output['payment']).toBe(REDACTED);
    expect(output['answer']).toBe(REDACTED);
  });

  it('does not mutate the input', () => {
    const input = { password: 'secret', keep: { token: 't' } };
    const snapshot = JSON.stringify(input);
    redactDeep(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('survives circular structures and deep nesting', () => {
    const circular: Record<string, unknown> = { name: 'root' };
    circular['self'] = circular;
    const output = redactDeep(circular) as Record<string, unknown>;
    expect(output['self']).toBe('[circular]');

    let deep: Record<string, unknown> = { value: 'bottom' };
    for (let level = 0; level < 20; level += 1) deep = { next: deep };
    const text = JSON.stringify(redactDeep(deep));
    expect(text).toContain('[max-depth]');
  });

  it('bounds arrays and long strings (log-flood protection)', () => {
    const output = redactDeep(
      Array.from({ length: 150 }, (_, index) => index),
      { maxArrayItems: 100 },
    ) as unknown[];
    expect(output).toHaveLength(101);
    expect(output[100]).toContain('50 more items truncated');
    const long = redactDeep('x'.repeat(5_000), { maxStringChars: 100 }) as string;
    expect(long.length).toBeLessThan(150);
    expect(long).toContain('[truncated]');
  });

  it('serializes special objects safely', () => {
    const output = redactDeep({
      at: new Date(Date.UTC(2026, 9, 14, 12)),
      bytes: Buffer.from([1, 2, 3]),
      error: new Error('boom'),
      fn: () => undefined,
      big: 10n,
    }) as Record<string, unknown>;
    expect(output['at']).toBe('2026-10-14T12:00:00.000Z');
    expect(output['bytes']).toBe('[bytes 3]');
    const error = output['error'] as Record<string, unknown>;
    expect(error['name']).toBe('Error');
    expect(error['message']).toBe('boom');
    expect(output['fn']).toBe('[function]');
    expect(output['big']).toBe('10n');
  });

  it('redacts Map entries with sensitive keys', () => {
    const output = redactDeep(
      new Map([
        ['password', 'x'],
        ['safe', 'y'],
      ]),
    ) as { entries: Array<[unknown, unknown]> };
    expect(output.entries).toEqual([
      ['password', REDACTED],
      ['safe', 'y'],
    ]);
  });

  it('isSensitiveKey is deliberately broad (fail closed, GOV-18)', () => {
    expect(isSensitiveKey('userPasswordHash')).toBe(true);
    expect(isSensitiveKey('refresh_token')).toBe(true);
    expect(isSensitiveKey('lastKnownLocation')).toBe(true);
    expect(isSensitiveKey('route')).toBe(false);
    expect(isSensitiveKey('durationMs')).toBe(false);
  });
});
