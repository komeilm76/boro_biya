import Fastify from 'fastify';
import {
  CORRELATION_HEADER,
  createCorrelationId,
  makeErrorEnvelope,
  makeHealthResponse,
} from '@boro/contracts';
import { createLogger, type AppLogger } from '@boro/logging';
import { SERVICE_VERSION } from './version.js';

/** Minimal database interface used by the readiness probe. */
export interface ReadinessDatabase {
  query: (queryText: string) => Promise<unknown>;
}

/** Dependencies accepted by the API factory so tests can replace external systems. */
export interface ApiServerOptions {
  database?: ReadinessDatabase;
  buildCommit?: string;
  loggerName?: string;
  logger?: AppLogger;
}

/**
 * Creates the infrastructure-only core API used during Phase 1.
 *
 * @param options - Optional database and public build identity dependencies.
 * @returns An unstarted Fastify instance with liveness, readiness, and a stable error envelope.
 */
export function createApiServer(options: ApiServerOptions = {}) {
  const service = 'api';
  const buildCommit = options.buildCommit ?? process.env.GIT_SHA ?? 'unknown';
  const app = Fastify({
    loggerInstance:
      options.logger ?? createLogger({ name: options.loggerName ?? service, level: 'silent' }),
    logController: new Fastify.LogController({ requestIdLogLabel: 'correlationId' }),
    genReqId: (request) => createCorrelationId(request.headers[CORRELATION_HEADER]),
    trustProxy: false,
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header(CORRELATION_HEADER, request.id);
  });

  app.get('/healthz', async () => makeHealthResponse(service, SERVICE_VERSION, buildCommit));

  app.get('/readyz', async (_request, reply) => {
    if (!options.database) {
      return reply
        .code(503)
        .send(makeHealthResponse(service, SERVICE_VERSION, buildCommit, 'not_ready'));
    }
    try {
      await options.database.query('SELECT 1');
      return makeHealthResponse(service, SERVICE_VERSION, buildCommit);
    } catch {
      return reply
        .code(503)
        .send(makeHealthResponse(service, SERVICE_VERSION, buildCommit, 'not_ready'));
    }
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(
      { errorName: error instanceof Error ? error.name : 'UnknownError' },
      'request failed',
    );
    const correlationId = createCorrelationId(request.id);
    return reply
      .code(500)
      .send(
        makeErrorEnvelope('INTERNAL_ERROR', 'The request could not be completed', correlationId),
      );
  });

  return app;
}
