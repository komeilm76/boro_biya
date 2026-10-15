import { readServerConfig } from '@boro-biya/config';
import { createDb } from '@boro-biya/db';
import {
  createLogger,
  createMetricsRegistry,
  createShutdownController,
  registerProcessMetrics,
  startMetricsServer,
} from '@boro-biya/server-runtime';
import { buildApp } from './app.js';
import { BUILD_VERSION } from './build-info.js';

/**
 * Process entry point. Configuration is read and validated first: an invalid or missing
 * variable fails startup with a clear, non-secret diagnostic before anything binds a port
 * (OPS-53). Shutdown drains within the configured window and closes every resource (OPS-62).
 */
const config = readServerConfig({ kind: 'api' });
const logger = createLogger({
  service: config.service,
  version: BUILD_VERSION,
  commit: config.buildCommit,
  level: config.logLevel,
});

const registry = createMetricsRegistry();
registerProcessMetrics(registry, config.service);

const db = createDb({
  connectionString: config.databaseUrl,
  max: config.dbPoolMax,
  connectTimeoutMillis: config.dbConnectTimeoutMs,
  statementTimeoutMillis: config.dbStatementTimeoutMs,
  applicationName: `boro-biya-${config.service}`,
  onUnexpectedError: (summary) => logger.error('unexpected database pool error', summary),
});

const app = buildApp({
  config,
  logger,
  registry,
  readiness: () => db.ping(Math.min(config.dbConnectTimeoutMs, 2_000)),
});

try {
  await app.listen({ host: config.apiHost, port: config.apiPort });
} catch (error) {
  logger.error('cannot bind the HTTP listener; exiting', { error });
  process.exit(1);
}

const metricsServer = await startMetricsServer({
  registry,
  host: config.metricsHost,
  port: config.metricsPort,
  logger,
});

const shutdown = createShutdownController({
  logger,
  timeoutSeconds: config.gracefulShutdownTimeoutSeconds,
  targets: [
    { name: 'http', close: () => app.close() },
    { name: 'metrics', close: () => metricsServer.close() },
    { name: 'database', close: () => db.close() },
  ],
});
shutdown.install();

logger.info('service started', {
  nodeEnv: config.nodeEnv,
  apiHost: config.apiHost,
  apiPort: config.apiPort,
  metricsHost: config.metricsHost,
  metricsPort: metricsServer.port,
});
