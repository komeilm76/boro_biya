/**
 * Route vocabulary shared by client and server.
 *
 * Client route namespaces (UI-01 … UI-04) are reserved for client routes and must never collide
 * with API paths; the leading underscore keeps them visually and structurally apart. Health and
 * metrics paths are infrastructure paths, never client routes (OPS-64), and metrics are served
 * only on a non-public interface (OPS-63).
 */
export const API_PREFIX = '/api/v1';

export const CLIENT_ROUTE_NAMESPACES = {
  auth: '/_auth',
  public: '/_public',
  user: '/_user',
  admin: '/_admin',
} as const;

export type ClientRouteNamespace = keyof typeof CLIENT_ROUTE_NAMESPACES;

export const CLIENT_ROUTE_NAMESPACE_VALUES = Object.values(CLIENT_ROUTE_NAMESPACES) as ReadonlyArray<
  (typeof CLIENT_ROUTE_NAMESPACES)[ClientRouteNamespace]
>;

export const HEALTHZ_PATH = '/healthz';
export const READYZ_PATH = '/readyz';
export const METRICS_PATH = '/metrics';

export const INFRASTRUCTURE_PATHS = [HEALTHZ_PATH, READYZ_PATH] as const;
