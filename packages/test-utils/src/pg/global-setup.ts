import { startTestDatabaseServer } from './index.js';

/**
 * Exit-code guard (GOV-12: a gate that cannot fail is not a gate). Importing the harness
 * imports `embedded-postgres`, which registers `async-exit-hook`; that hook's `beforeExit`
 * path finishes with a hardcoded `process.exit(0)` once its asynchronous shutdown drains.
 * Vitest signals a failing run through `process.exitCode` and then lets the event loop drain —
 * so without this guard a FAILED integration run exits 0 and every consumer of that exit
 * status (the gate runner, CI, this repository's own discipline) is silently lied to. The
 * wrapper rewrites only a late `exit(0)`/`exit()` when a non-zero `process.exitCode` is
 * already recorded; every other exit passes through untouched.
 */
const realExit = process.exit.bind(process);
process.exit = (code?: number): never => {
  const intended = process.exitCode;
  if ((code === undefined || code === 0) && typeof intended === 'number' && intended !== 0) {
    return realExit(intended);
  }
  return realExit(code);
};

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
