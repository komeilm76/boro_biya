import { Writable } from 'node:stream';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CORRELATION_HEADER, correlationHeaders, createCorrelationId } from '@boro/contracts';
import { createLogger } from '@boro/logging';
import { createRelationServer } from '../../../services/relation/src/index.js';
import { createApiServer } from './server.js';
import { SERVICE_VERSION } from './version.js';

const syntheticDatabase = (query: () => Promise<unknown>) => ({ query });

function captureLines(lines: string[]): Writable {
  return new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString('utf8'));
      callback();
    },
  });
}

function requestJson(
  url: string,
  headers: Record<string, string> = {},
): Promise<{ statusCode: number | undefined; headers: IncomingHttpHeaders; body: unknown }> {
  return new Promise((resolve, reject) => {
    const outbound = httpRequest(url, { method: 'GET', headers }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        text += chunk;
      });
      response.once('error', reject);
      response.once('end', () => {
        try {
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body: JSON.parse(text) as unknown,
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    outbound.once('error', reject);
    outbound.end();
  });
}

describe('core API infrastructure shell', () => {
  it('reports liveness without consulting the database', async () => {
    const query = vi.fn(async () => {
      throw new Error('database is not part of liveness');
    });
    const app = createApiServer({ database: syntheticDatabase(query) });
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', service: 'api', version: '1.0.0' });
    expect(query).not.toHaveBeenCalled();
    await app.close();
  });

  it('reports readiness only after the database responds', async () => {
    const query = vi.fn(async () => undefined);
    const app = createApiServer({ database: syntheticDatabase(query) });
    const response = await app.inject({ method: 'GET', url: '/readyz' });
    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledWith('SELECT 1');
    await app.close();
  });

  it('fails readiness closed when no database is configured', async () => {
    const app = createApiServer();
    const response = await app.inject({ method: 'GET', url: '/readyz' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: 'not_ready', service: 'api' });
    await app.close();
  });

  it('fails readiness closed when the database rejects a query', async () => {
    const app = createApiServer({
      database: syntheticDatabase(async () => {
        throw new Error('private database diagnostic');
      }),
    });
    const response = await app.inject({ method: 'GET', url: '/readyz' });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('private database diagnostic');
    await app.close();
  });

  it('keeps a valid correlation identifier on the response', async () => {
    const app = createApiServer();
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-correlation-id': 'phase1-acceptance-17' },
    });
    expect(response.headers['x-correlation-id']).toBe('phase1-acceptance-17');
    await app.close();
  });

  it('replaces an invalid correlation identifier rather than echoing it', async () => {
    const app = createApiServer();
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-correlation-id': 'not safe' },
    });
    expect(response.headers['x-correlation-id']).not.toBe('not safe');
    expect(response.headers['x-correlation-id']).toMatch(/^[\da-f-]{36}$/i);
    await app.close();
  });

  it('propagates one correlation identifier across a service hop and both request logs', async () => {
    const apiLines: string[] = [];
    const relationLines: string[] = [];
    const api = createApiServer({
      logger: createLogger({ name: 'api-hop-test', level: 'info', stream: captureLines(apiLines) }),
    });
    const relation = createRelationServer(
      createLogger({
        name: 'relation-hop-test',
        level: 'info',
        stream: captureLines(relationLines),
      }),
    );

    relation.get('/_test/correlation', async (request) => {
      request.log.info('handled forwarded request');
      return { correlationId: request.id };
    });
    await relation.listen({ host: '127.0.0.1', port: 0 });
    const relationAddress = relation.server.address();
    if (!relationAddress || typeof relationAddress === 'string') {
      await relation.close();
      await api.close();
      throw new Error('Relation Service did not bind to an ephemeral port');
    }

    api.get('/_test/hop', async (request) => {
      request.log.info('forwarding request to Relation Service');
      const downstream = await requestJson(
        `http://127.0.0.1:${relationAddress.port}/_test/correlation`,
        correlationHeaders(createCorrelationId(request.id)),
      );
      return {
        correlationId: downstream.headers[CORRELATION_HEADER] ?? null,
        downstream: downstream.body as { correlationId: string },
      };
    });
    await api.listen({ host: '127.0.0.1', port: 0 });
    const apiAddress = api.server.address();
    if (!apiAddress || typeof apiAddress === 'string') {
      await api.close();
      await relation.close();
      throw new Error('API did not bind to an ephemeral port');
    }

    try {
      const correlationId = 'phase1-hop-42';
      const response = await requestJson(`http://127.0.0.1:${apiAddress.port}/_test/hop`, {
        [CORRELATION_HEADER]: correlationId,
      });
      const result = response.body as {
        correlationId: string | null;
        downstream: { correlationId: string };
      };
      expect(response.statusCode).toBe(200);
      expect(response.headers[CORRELATION_HEADER]).toBe(correlationId);
      expect(result).toEqual({ correlationId, downstream: { correlationId } });
      expect(apiLines.join('')).toContain(`"correlationId":"${correlationId}"`);
      expect(relationLines.join('')).toContain(`"correlationId":"${correlationId}"`);
    } finally {
      await api.close();
      await relation.close();
    }
  });

  it('returns a stable error response without exposing exception details', async () => {
    const app = createApiServer();
    app.get('/test/failure', async () => {
      throw new Error('private stack detail');
    });
    const response = await app.inject({ method: 'GET', url: '/test/failure' });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
    expect(response.body).not.toContain('private stack detail');
    await app.close();
  });

  it('keeps its service version aligned with the workspace manifest', () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'apps/api/package.json'), 'utf8'),
    ) as {
      version: string;
    };
    expect(SERVICE_VERSION).toBe(manifest.version);
  });
});
