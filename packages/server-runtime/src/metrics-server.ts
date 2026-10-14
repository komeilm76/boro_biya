import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { METRICS_PATH } from '@boro-biya/contracts';
import type { Logger } from './logger.js';
import type { MetricsRegistry } from './metrics.js';

/**
 * The metrics endpoint (OPS-63): served on a separate HTTP server bound to a non-public
 * interface — by default 127.0.0.1, and in Compose a port that is never published to the host.
 * The registry itself rejects sensitive label names, and route labels are matched patterns, so
 * no user identifier, coordinate, or token can appear in a label value by construction.
 */
export interface MetricsServerOptions {
  registry: MetricsRegistry;
  host: string;
  port: number;
  logger?: Logger;
}

export interface MetricsServer {
  readonly host: string;
  readonly port: number;
  close(): Promise<void>;
}

export async function startMetricsServer(options: MetricsServerOptions): Promise<MetricsServer> {
  const server: Server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://metrics.internal').pathname;
    if (request.method === 'GET' && pathname === METRICS_PATH) {
      const body = options.registry.render();
      response.writeHead(200, { 'content-type': 'text/plain; version=0.0.4', 'cache-control': 'no-store' });
      response.end(body);
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found\n');
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(options.port, options.host, () => {
      server.removeListener('error', rejectListen);
      resolveListen();
    });
  });

  const address = server.address() as AddressInfo;
  server.on('error', (error: Error) => {
    options.logger?.error('metrics server error', { error });
  });

  return {
    host: address.address,
    port: address.port,
    async close(): Promise<void> {
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error !== undefined ? rejectClose(error) : resolveClose()));
        server.closeIdleConnections?.();
      });
    },
  };
}
