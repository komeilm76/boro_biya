import { z } from 'zod';
import { ConfigurationError } from './errors.js';

/** Strict process settings required by the Phase 1 service skeleton. */
export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVICE_NAME: z.enum(['api', 'relation', 'sos']).default('api'),
  API_HOST: z.string().trim().min(1).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.string().url().optional(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
  GIT_SHA: z
    .string()
    .regex(/^[a-f\d]{7,40}$/i)
    .optional(),
});

/** Parsed, non-secret process configuration shared by server workspaces. */
export type AppConfig = z.infer<typeof environmentSchema>;

/**
 * Validates the environment once at process startup.
 *
 * @param input - Environment values, normally `process.env`.
 * @returns Safe configuration with defaults applied.
 * @throws {@link ConfigurationError} with variable names but never their values.
 */
export function parseConfig(input: NodeJS.ProcessEnv): AppConfig {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    const keys = [
      ...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? 'configuration'))),
    ];
    throw new ConfigurationError(keys);
  }
  return result.data;
}
