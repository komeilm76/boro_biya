import { startTestDatabaseServer } from './index.js';

/**
 * Vitest global setup for the integration run: one disposable PostgreSQL server per run, its
 * administrative URL provided to every test file through `inject('pgAdminUrl')`. Each file
 * creates its own database inside the instance and drops it on teardown (QA-06: isolated,
 * disposable database).
 */
export default async function setup(context: {
  provide(key: string, value: unknown): void;
}): Promise<() => Promise<void>> {
  const startedAt = Date.now();
  const server = await startTestDatabaseServer();
  const version = await server.serverVersion();
  context.provide('pgAdminUrl', server.adminConnectionString);
  process.stdout.write(
    `[integration] disposable PostgreSQL ${version} ready on 127.0.0.1:${server.port} in ${Date.now() - startedAt} ms\n`,
  );
  return async () => {
    await server.stop();
    process.stdout.write('[integration] disposable PostgreSQL stopped\n');
  };
}
