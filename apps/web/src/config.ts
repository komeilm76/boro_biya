import { webClientConfigSchema, type WebClientConfig } from '@boro-biya/validation';

/**
 * Validate the client configuration at startup and fail loudly on an invalid build environment
 * (the client-side twin of OPS-53). Values come from `VITE_*` variables baked in at build time;
 * the API base is same-origin by default, so browser code never names a backend host (OPS-64).
 */
export function loadWebClientConfig(env: Readonly<Record<string, unknown>> = import.meta.env): WebClientConfig {
  return webClientConfigSchema.parse({
    apiBase: typeof env['VITE_API_BASE'] === 'string' ? env['VITE_API_BASE'] : undefined,
    defaultLocale: typeof env['VITE_DEFAULT_LOCALE'] === 'string' ? env['VITE_DEFAULT_LOCALE'] : undefined,
  });
}
