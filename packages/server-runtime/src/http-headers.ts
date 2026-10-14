import type { FastifyInstance } from 'fastify';
import { CORRELATION_ID_HEADER, IDEMPOTENCY_KEY_HEADER, REQUEST_ID_HEADER } from '@boro-biya/contracts';

/**
 * Baseline security headers for JSON API responses (SEC-45 hardening baseline, Phase 1 slice;
 * the full security-header set and CSP for browser documents arrive with SEC-45 in Phase 2 —
 * the API serves no HTML, so its policy denies rendering outright).
 */
export const API_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'referrer-policy': 'no-referrer',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
};

export function applySecurityHeaders(app: FastifyInstance): void {
  app.addHook('onSend', async (_request, reply) => {
    for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) {
      void reply.header(name, value);
    }
  });
}

/**
 * Minimal CORS enforcement (SEC-44, Phase 1 slice): the origin must appear in the explicit
 * configured list — a wildcard is rejected here as well as in configuration, so defence does not
 * depend on one layer (GOV-18). The same-origin proxy topology means the default list is empty.
 */
export function applyCors(app: FastifyInstance, allowedOrigins: readonly string[]): void {
  if (allowedOrigins.includes('*')) {
    throw new Error('CORS wildcard origin rejected (SEC-44): list explicit origins');
  }
  const allowed = new Set(allowedOrigins);
  const allowHeaders = ['content-type', CORRELATION_ID_HEADER, REQUEST_ID_HEADER, IDEMPOTENCY_KEY_HEADER].join(',');

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers['origin'];
    if (typeof origin !== 'string' || !allowed.has(origin)) return;
    void reply.header('access-control-allow-origin', origin);
    void reply.header('vary', 'Origin');
    void reply.header('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    void reply.header('access-control-allow-headers', allowHeaders);
    void reply.header('access-control-max-age', '600');
    if (request.method === 'OPTIONS') {
      void reply.status(204).send();
    }
  });
}
