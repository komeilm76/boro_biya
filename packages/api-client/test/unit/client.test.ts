import { describe, expect, it } from 'vitest';
import { makeErrorEnvelopeFixture, makeHealthFixture, makeReadyFixture } from '@boro-biya/test-utils';
import { CORRELATION_ID_HEADER } from '@boro-biya/contracts';
import { ApiClientError, ApiResponseError, createApiClient } from '../../src/client.js';

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, ...(init !== undefined ? { init } : {}) });
    return handler(url, init);
  }) as typeof fetch;
  return { impl, calls };
}

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('createApiClient (OPS-35, API-23)', () => {
  it('validates success responses against the shared contract', async () => {
    const fixture = makeHealthFixture();
    const stub = stubFetch(() => jsonResponse(200, fixture));
    const client = createApiClient({ fetchImpl: stub.impl });
    await expect(client.health()).resolves.toEqual(fixture);
  });

  it('fails closed when a success body violates the contract', async () => {
    const stub = stubFetch(() =>
      jsonResponse(200, { status: 'ok', service: 'api', version: 1, commit: 'c', serverTime: 'not-a-timestamp' }),
    );
    const client = createApiClient({ fetchImpl: stub.impl });
    await expect(client.health()).rejects.toBeInstanceOf(ApiResponseError);
  });

  it('surfaces envelope errors with code and requestId (API-11)', async () => {
    const envelope = makeErrorEnvelopeFixture({ code: 'service_unavailable' });
    const stub = stubFetch(() => jsonResponse(503, envelope));
    const client = createApiClient({ fetchImpl: stub.impl });
    const error = await client.ready().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiClientError);
    const clientError = error as ApiClientError;
    expect(clientError.status).toBe(503);
    expect(clientError.envelope.code).toBe('service_unavailable');
    expect(clientError.envelope.requestId).toBe(envelope.requestId);
  });

  it('normalizes an error without a valid envelope instead of passing garbage up', async () => {
    const stub = stubFetch(() => jsonResponse(500, { oops: true }));
    const client = createApiClient({ fetchImpl: stub.impl });
    const error = await client.health().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).envelope.code).toBe('internal_error');
  });

  it('sends one correlation identifier per action (SEC-73)', async () => {
    const stub = stubFetch(() => jsonResponse(200, makeReadyFixture()));
    const client = createApiClient({ fetchImpl: stub.impl });
    await client.ready();
    await client.ready();
    const sent = stub.calls.map((call) =>
      String((call.init?.headers as Record<string, string>)[CORRELATION_ID_HEADER]),
    );
    expect(sent[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(sent[0]).not.toBe(sent[1]);
  });

  it('uses same-origin relative paths by default and refuses non-root-relative paths', async () => {
    const stub = stubFetch(() => jsonResponse(200, makeReadyFixture()));
    const client = createApiClient({ fetchImpl: stub.impl });
    await client.ready();
    expect(stub.calls[0]?.url).toBe('/readyz');
    await expect(client.request('healthz', { parse: (data) => data })).rejects.toBeInstanceOf(ApiResponseError);
  });

  it('wraps network failures as ApiResponseError', async () => {
    const stub = stubFetch(() => {
      throw new Error('ECONNREFUSED');
    });
    const client = createApiClient({ fetchImpl: stub.impl });
    await expect(client.health()).rejects.toBeInstanceOf(ApiResponseError);
  });

  it('rejects non-JSON responses', async () => {
    const stub = stubFetch(
      () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    const client = createApiClient({ fetchImpl: stub.impl });
    await expect(client.health()).rejects.toBeInstanceOf(ApiResponseError);
  });
});
