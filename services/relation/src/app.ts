import Fastify, { type FastifyInstance } from 'fastify';
import type { ServerConfig } from '@boro-biya/config';
import {
  applyCors,
  applyErrorEnvelope,
  applyHealthRoutes,
  applyObservability,
  applySecurityHeaders,
  type Logger,
  type MetricsRegistry,
} from '@boro-biya/server-runtime';
import { BUILD_VERSION } from './build-info.js';

export interface BuildAppOptions {
  config: ServerConfig;
  logger: Logger;
  registry: MetricsRegistry;
  /** Injected so tests can fake dependency states (GOV-61); production passes the pool ping. */
  readiness?: () => Promise<boolean>;
}

/**
 * The Relation Service skeleton (OPS-03): its own schema and least-privilege role (OPS-16 …
 * OPS-18), the shared harness, and no domain routes. Follow, category, invite, and block
 * endpoints arrive in Phase 4 under /relation/* (PLG-35) and are recorded in the API inventory
 * before they exist in code (GOV-02).
 */
export function buildApp(options: BuildAppOptions): FastifyInstance {
  const { config, logger, registry } = options;
  const app = Fastify({
    // Logging is owned by the shared harness (SEC-57); with `logger: false` Fastify emits no
    // request logs of its own (FSTDEP023 avoided).
    logger: false,
    trustProxy: config.trustProxy,
    bodyLimit: 1_048_576,
  });

  applyObservability(app, { logger, registry, service: config.service });
  applySecurityHeaders(app);
  applyCors(app, config.corsAllowedOrigins);
  applyErrorEnvelope(app, { logger });
  applyHealthRoutes(app, {
    service: config.service,
    version: BUILD_VERSION,
    commit: config.buildCommit,
    ...(options.readiness !== undefined ? { readiness: options.readiness } : {}),
  });

  return app;
}
