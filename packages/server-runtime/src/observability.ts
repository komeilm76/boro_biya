import type { FastifyInstance } from 'fastify';
import { CORRELATION_ID_HEADER, REQUEST_ID_HEADER } from '@boro-biya/contracts';
import { newCorrelationId, safePathForLog, sanitizeIncomingCorrelationId } from './correlation.js';
import type { Logger } from './logger.js';
import type { CounterHandle, MetricsRegistry } from './metrics.js';

/**
 * Request observability wiring shared by every backend service (SEC-57, SEC-73, OPS-63).
 * Applied directly to the Fastify instance (no plugin encapsulation, no fastify-plugin
 * dependency): decorations and hooks live in the single root scope every service uses.
 */
declare module 'fastify' {
  interface FastifyRequest {
    /** The correlation identifier for this request's whole action across services (SEC-73). */
    correlationId: string;
    /** Child logger bound to the correlation identifier; set in `onRequest`. */
    requestLog: Logger | null;
    /** High-resolution start time in milliseconds. */
    startedAt: number;
  }
}

export interface ObservabilityOptions {
  logger: Logger;
  registry: MetricsRegistry;
  service: string;
  /** Shared counter so all services expose the same metric name. */
  requestCounter?: CounterHandle;
}

export function createRequestCounter(registry: MetricsRegistry): CounterHandle {
  return registry.counter(
    'http_requests_total',
    'HTTP requests by service, method, matched route pattern, and status. Labels are bounded: route is the matched pattern, never the raw URL (OPS-63).',
    ['service', 'method', 'route', 'status'],
  );
}

export function applyObservability(app: FastifyInstance, options: ObservabilityOptions): void {
  const counter = options.requestCounter ?? createRequestCounter(options.registry);

  app.decorateRequest('correlationId', '');
  app.decorateRequest('requestLog', null);
  app.decorateRequest('startedAt', 0);

  // Synchronous hook: Fastify requires `done()` from non-async hooks (returning a promise is
  // the async contract; a sync hook that never calls done stalls every request).
  app.addHook('onRequest', (request, _reply, done) => {
    const incomingHeader = request.headers[CORRELATION_ID_HEADER] ?? request.headers[REQUEST_ID_HEADER];
    const correlationId = sanitizeIncomingCorrelationId(incomingHeader) ?? newCorrelationId();
    request.correlationId = correlationId;
    request.requestLog = options.logger.child({ correlationId });
    request.startedAt = performance.now();
    request.requestLog.debug('request started', { method: request.method, path: safePathForLog(request.url) });
    done();
  });

  app.addHook('onResponse', async (request, reply) => {
    const durationMs = Math.round(performance.now() - request.startedAt);
    const route = request.routeOptions?.url ?? 'unmatched';
    (request.requestLog ?? options.logger).info('request completed', {
      method: request.method,
      route,
      status: reply.statusCode,
      durationMs,
    });
    counter.inc({ service: options.service, method: request.method, route, status: String(reply.statusCode) });
  });

  app.addHook('onSend', async (request, reply) => {
    if (request.correlationId !== '') {
      void reply.header(CORRELATION_ID_HEADER, request.correlationId);
      void reply.header(REQUEST_ID_HEADER, request.correlationId);
    }
  });
}
