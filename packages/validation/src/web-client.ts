import { z } from 'zod';

/**
 * Web client configuration (browser side). The client is built independently of the backend
 * runtime (GOV-90): its configuration is validated at startup from `VITE_*` variables with safe
 * defaults, and the API base defaults to the empty string, which means same-origin relative
 * paths — browser-facing code never names a host (the dev server proxies, the production static
 * server proxies, per OPS-64 and the deployment notes).
 *
 * The default locale is English and is never inferred from headers or geo-IP (ADR-018). The
 * full locale switcher and persistence arrive with the message catalogues in Phase 2 (UI-21).
 */
export const webClientConfigSchema = z.object({
  apiBase: z
    .string()
    .max(2000)
    .refine((value) => value === '' || value.startsWith('/'), {
      message: 'VITE_API_BASE must be empty (same-origin) or a root-relative path in Phase 1 builds',
    })
    .default(''),
  defaultLocale: z.enum(['en', 'fa']).default('en'),
});

export type WebClientConfig = z.infer<typeof webClientConfigSchema>;
