import { describe, expect, it } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { CLIENT_ROUTE_NAMESPACES } from '@boro-biya/contracts';
import { createAppRouter, ROUTE_NAMES, routes } from '../../src/router/index.js';

describe('client route namespaces (UI-01 … UI-04)', () => {
  it('resolves every namespace and tags it in route metadata', () => {
    const router = createAppRouter(createMemoryHistory());
    const expectations: Array<[string, string]> = [
      ['/_auth/login', 'auth'],
      ['/_public', 'public'],
      ['/_user', 'user'],
      ['/_admin', 'admin'],
    ];
    for (const [path, namespace] of expectations) {
      const resolved = router.resolve(path);
      expect(resolved.matched.length, path).toBeGreaterThan(0);
      expect(resolved.meta['namespace'], path).toBe(namespace);
    }
  });

  it('routes the root to the public namespace', () => {
    const root = routes.find((route) => route.path === '/');
    expect(root?.redirect).toBe(CLIENT_ROUTE_NAMESPACES.public);
  });

  it('catches every unknown path with the not-found route (UI-07)', () => {
    const router = createAppRouter(createMemoryHistory());
    for (const path of ['/nope', '/_public/deep/unknown', '/api/v1/looks-like-api', '/%2e%2e/whatever']) {
      const resolved = router.resolve(path);
      expect(resolved.name, path).toBe(ROUTE_NAMES.notFound);
    }
  });

  it('keeps client namespaces away from API and infrastructure paths (OPS-64)', () => {
    for (const route of routes) {
      expect(route.path.startsWith('/api')).toBe(false);
      expect(route.path === '/healthz' || route.path === '/readyz' || route.path === '/metrics').toBe(false);
    }
  });
});
