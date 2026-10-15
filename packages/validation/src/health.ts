import { z } from 'zod';
import { serviceNameSchema } from './services.js';
import { utcInstantSchema } from './time.js';

/**
 * Liveness (OPS-59, OPS-61): `/healthz` proves the process runs. It never checks dependencies, so
 * a database outage cannot make the orchestrator kill a healthy process. The response carries the
 * service name, version, and build commit (OPS-61) and a wire-contract timestamp (API-36).
 */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: serviceNameSchema,
  version: z.string().min(1).max(50),
  commit: z.string().min(1).max(64),
  serverTime: utcInstantSchema,
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

/**
 * Readiness (OPS-59, OPS-60): `/readyz` reports whether the dependencies needed to serve traffic
 * are reachable, each with a short timeout. The public response is booleans only — diagnostic
 * detail belongs in server logs, never in the response.
 */
export const readyResponseSchema = z.object({
  status: z.enum(['ready', 'unavailable']),
  service: serviceNameSchema,
  checks: z.record(z.string().min(1).max(40), z.boolean()),
});

export type ReadyResponse = z.infer<typeof readyResponseSchema>;
