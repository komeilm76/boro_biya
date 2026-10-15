import type { Logger } from './logger.js';

/**
 * Graceful shutdown (OPS-62): on a termination signal the service stops accepting new
 * connections, drains in-flight requests within a bounded window, closes its metrics server and
 * database pool, and exits non-zero only if the window was exceeded. The exit function is
 * injectable so tests can assert the sequence without killing the test runner (GOV-61).
 */
export interface ShutdownTarget {
  name: string;
  close(): Promise<unknown>;
}

export interface ShutdownController {
  /** Run the shutdown sequence; resolves to the intended process exit code. */
  shutdown(reason: string): Promise<number>;
  /** Attach signal handlers once; returns a detach function. */
  install(signals?: readonly NodeJS.Signals[]): () => void;
}

export interface ShutdownOptions {
  logger: Logger;
  timeoutSeconds: number;
  targets: ShutdownTarget[];
  /** Defaults to `process.exit`. */
  exit?: (code: number) => void;
}

export function createShutdownController(options: ShutdownOptions): ShutdownController {
  let started: Promise<number> | null = null;
  const exit = options.exit ?? ((code: number) => process.exit(code));

  async function runShutdown(reason: string): Promise<number> {
    options.logger.info('shutdown started', { reason, timeoutSeconds: options.timeoutSeconds });
    const closing = Promise.allSettled(
      options.targets.map(async (target) => {
        try {
          await target.close();
          options.logger.debug('shutdown target closed', { target: target.name });
        } catch (error) {
          options.logger.error('shutdown target failed to close', { target: target.name, error });
        }
      }),
    );
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timedOut = await Promise.race([
      closing.then(() => false),
      new Promise<boolean>((resolveTimeout) => {
        timeoutHandle = setTimeout(() => resolveTimeout(true), options.timeoutSeconds * 1_000);
      }),
    ]);
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    if (timedOut) {
      options.logger.error('shutdown window exceeded; forcing exit', { timeoutSeconds: options.timeoutSeconds });
      return 1;
    }
    options.logger.info('shutdown complete');
    return 0;
  }

  function shutdown(reason: string): Promise<number> {
    started ??= runShutdown(reason);
    return started;
  }

  return {
    shutdown,
    install(signals = ['SIGTERM', 'SIGINT']): () => void {
      const handlers = new Map<NodeJS.Signals, () => void>();
      for (const signal of signals) {
        const handler = (): void => {
          void shutdown(signal).then((code) => exit(code));
        };
        handlers.set(signal, handler);
        process.on(signal, handler);
      }
      return () => {
        for (const [signal, handler] of handlers) process.off(signal, handler);
      };
    },
  };
}
