import { describe, expect, it } from 'vitest';
import { errorEnvelopeSchema } from '@boro-biya/validation';
import {
  API_PREFIX,
  buildErrorEnvelope,
  CLIENT_ROUTE_NAMESPACES,
  CORRELATION_ID_HEADER,
  ERROR_CODES,
  HEALTHZ_PATH,
  INFRASTRUCTURE_PATHS,
  METRICS_PATH,
  READYZ_PATH,
  REQUEST_ID_HEADER,
} from '../../src/index.js';

describe('route vocabulary (UI-01 … UI-04, OPS-64)', () => {
  it('fixes the four reserved client namespaces', () => {
    expect(CLIENT_ROUTE_NAMESPACES).toEqual({
      auth: '/_auth',
      public: '/_public',
      user: '/_user',
      admin: '/_admin',
    });
  });

  it('keeps infrastructure paths out of the client namespaces and the API prefix', () => {
    expect(API_PREFIX).toBe('/api/v1');
    for (const path of INFRASTRUCTURE_PATHS) {
      expect(path.startsWith(API_PREFIX)).toBe(false);
      for (const namespace of Object.values(CLIENT_ROUTE_NAMESPACES)) {
        expect(path.startsWith(namespace)).toBe(false);
      }
    }
    expect(HEALTHZ_PATH).toBe('/healthz');
    expect(READYZ_PATH).toBe('/readyz');
    expect(METRICS_PATH).toBe('/metrics');
  });
});

describe('error envelope contract (API-11, API-37)', () => {
  it('builds envelopes that the shared schema accepts', () => {
    const envelope = buildErrorEnvelope({
      code: ERROR_CODES.notFound,
      message: 'No route matches this path and method.',
      requestId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    });
    expect(errorEnvelopeSchema.safeParse(envelope).success).toBe(true);
    expect(envelope.code).toBe('not_found');
  });

  it('fails closed on a malformed envelope instead of shipping it', () => {
    expect(() => buildErrorEnvelope({ code: 'Not Found!', message: 'x', requestId: 'short' })).toThrow();
  });

  it('keeps every stable code lower_snake_case', () => {
    for (const code of Object.values(ERROR_CODES)) {
      expect(code).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});

describe('header names (SEC-73)', () => {
  it('uses lowercase HTTP/2-normalized names', () => {
    expect(CORRELATION_ID_HEADER).toBe('x-correlation-id');
    expect(REQUEST_ID_HEADER).toBe('x-request-id');
  });
});
