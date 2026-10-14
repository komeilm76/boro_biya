import { parseConfig } from '@boro/config';
import { createLogger } from '@boro/logging';
import { createDatabasePool } from './db/pool.js';
import { createApiServer } from './server.js';

async function start(): Promise<void> {
  const config = parseConfig(process.env);
  const pool = createDatabasePool(config.DATABASE_URL, config.DB_POOL_MAX);
  const logger = createLogger({ name: 'api', level: config.LOG_LEVEL });
  const server = createApiServer({
    ...(pool ? { database: pool } : {}),
    logger,
    loggerName: 'api',
  });

  try {
    await server.listen({ host: config.API_HOST, port: config.API_PORT });
    logger.info({ port: config.API_PORT }, 'API listening');
  } catch (error) {
    logger.error(
      { errorName: error instanceof Error ? error.name : 'UnknownError' },
      'API startup failed',
    );
    if (pool) await pool.end();
    throw error;
  }

  let closing = false;
  const shutdown = async (): Promise<void> => {
    if (closing) return;
    closing = true;
    await server.close();
    if (pool) await pool.end();
    logger.info('API shutdown complete');
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

void start().catch(() => {
  process.stderr.write('API failed to start; check validated configuration and service logs.\n');
  process.exitCode = 1;
});
