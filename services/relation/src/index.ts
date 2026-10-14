import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import {
  CORRELATION_HEADER,
  createCorrelationId,
  makeErrorEnvelope,
  makeHealthResponse,
} from '@boro/contracts';
import { parseConfig } from '@boro/config';
import { createLogger, type AppLogger } from '@boro/logging';
import { SERVICE_VERSION } from './version.js';

/** Creates the infrastructure-only Relation Service. Domain routes arrive in Phase 4. */
export function createRelationServer(
  logger: AppLogger = createLogger({ name: 'relation', level: 'silent' }),
) {
  const app = Fastify({
    loggerInstance: logger,
    logController: new Fastify.LogController({ requestIdLogLabel: 'correlationId' }),
    genReqId: (request) => createCorrelationId(request.headers[CORRELATION_HEADER]),
    trustProxy: false,
  });
  app.addHook('onRequest', async (request, reply) => {
    reply.header(CORRELATION_HEADER, request.id);
  });
  app.get('/healthz', async () =>
    makeHealthResponse('relation', SERVICE_VERSION, process.env.GIT_SHA ?? 'unknown'),
  );
  app.get('/readyz', async () =>
    makeHealthResponse('relation', SERVICE_VERSION, process.env.GIT_SHA ?? 'unknown'),
  );
  app.setErrorHandler((error, request, reply) => {
    request.log.error(
      { errorName: error instanceof Error ? error.name : 'UnknownError' },
      'request failed',
    );
    return reply
      .code(500)
      .send(
        makeErrorEnvelope(
          'INTERNAL_ERROR',
          'The request could not be completed',
          createCorrelationId(request.id),
        ),
      );
  });
  return app;
}

async function start(): Promise<void> {
  const config = parseConfig({ ...process.env, SERVICE_NAME: 'relation' });
  const logger = createLogger({ name: 'relation', level: config.LOG_LEVEL });
  const server = createRelationServer(logger);
  await server.listen({ host: config.API_HOST, port: config.API_PORT });
  logger.info({ port: config.API_PORT }, 'Relation Service listening');
  const shutdown = async (): Promise<void> => {
    await server.close();
    logger.info('Relation Service shutdown complete');
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void start().catch(() => {
    process.stderr.write(
      'Relation Service failed to start; check validated configuration and service logs.\n',
    );
    process.exitCode = 1;
  });
}

export { SERVICE_VERSION };
