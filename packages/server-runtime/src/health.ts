import type { FastifyInstance } from 'fastify';
import { HEALTHZ_PATH, READYZ_PATH } from '@boro-biya/contracts';
import { healthResponseSchema, nowUtcInstant, readyResponseSchema, type ServiceName } from '@boro-biya/validation';

/**
 * Operational endpoints (OPS-59 … OPS-61, OPS-64):
 * - `/healthz` proves the process runs. It never touches a dependency, so a database outage
 *   cannot cascade into restarts of a healthy process.
 * - `/readyz` proves the service can do its job: each dependency needed to serve traffic is
 *   checked with a short timeout. The public response carries booleans only — the reason belongs
 *   in the server-side log (OPS-60).
 * Both responses are validated against the shared schemas before they are sent, so the wire
 * contract (including the API-36 timestamp) is enforced by construction, not by review.
 * These are infrastructure paths, never client routes (OPS-64).
 */
export interface HealthRoutesOptions {
  service: ServiceName;
  version: string;
  commit: string;
  /** Returns true when the dependency is reachable within the timeout. */
  readiness?: () => Promise<boolean>;
  /** Short bound for the readiness probe (OPS-59). Defaults to 2000 ms. */
  readinessTimeoutMs?: number;
}

async function withTimeout(probe: Promise<boolean>, timeoutMs: number): Promise<boolean> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      probe,
      new Promise<boolean>((resolveTimeout) => {
        timeoutHandle = setTimeout(() => resolveTimeout(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}

export function applyHealthRoutes(app: FastifyInstance, options: HealthRoutesOptions): void {
  const timeoutMs = options.readinessTimeoutMs ?? 2_000;

  app.get(HEALTHZ_PATH, () =>
    healthResponseSchema.parse({
      status: 'ok',
      service: options.service,
      version: options.version,
      commit: options.commit,
      serverTime: nowUtcInstant(),
    }),
  );

  app.get(READYZ_PATH, async (request, reply) => {
    if (options.readiness === undefined) {
      return readyResponseSchema.parse({ status: 'ready', service: options.service, checks: {} });
    }
    const ok = await withTimeout(
      options.readiness().catch(() => false),
      timeoutMs,
    );
    const body = readyResponseSchema.parse({
      status: ok ? 'ready' : 'unavailable',
      service: options.service,
      checks: { database: ok },
    });
    if (!ok) {
      request.requestLog?.warn('readiness probe reports unavailable', { check: 'database', timeoutMs });
      return reply.status(503).send(body);
    }
    return body;
  });
}
