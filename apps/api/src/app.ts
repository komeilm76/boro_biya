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
import { applyAuthRoutes } from './auth/routes.js';
import type { AuthService } from './auth/service.js';
import { BUILD_VERSION } from './build-info.js';

export interface BuildAppOptions {
  config: ServerConfig;
  logger: Logger;
  registry: MetricsRegistry;
  /** Injected so tests can fake dependency states (GOV-61); production passes the pool ping. */
  readiness?: () => Promise<boolean>;
  auth?: AuthService;
}

/**
 * The core API skeleton (OPS-02). Phase 1 deliberately exposes no `/api/v1` business routes:
 * an endpoint exists in code only after it is recorded in the API inventory
 * (docs/development/04-api-inventory.md §9), and the first business endpoints arrive with
 * Phase 2. Requests to unknown paths — `/api/v1/*` included — receive the shared error
 * envelope (API-11) with the correlation identifier (SEC-73).
 */
export function buildApp(options: BuildAppOptions): FastifyInstance {
  const { config, logger, registry } = options;
  const app = Fastify({
    // Logging is owned by the shared harness (SEC-57); with `logger: false` Fastify emits no
    // request logs of its own, so no further logging option is needed (FSTDEP023 avoided).
    logger: false,
    trustProxy: config.trustProxy,
    // Conservative skeleton bound; per-route explicit limits arrive with API-15 in Phase 2.
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

  if (options.auth !== undefined) applyAuthRoutes(app, options.auth);
  return app;
}
