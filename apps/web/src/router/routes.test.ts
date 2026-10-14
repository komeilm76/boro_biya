import { describe, expect, it } from 'vitest';
import { appRoutes, routeNames } from './routes.js';

describe('route inventory', () => {
  it('keeps the public, auth, user, and admin namespaces distinct', () => {
    const paths = appRoutes.map((route) => route.path);
    expect(paths).toContain('/_public/home');
    expect(paths).toContain('/_auth/login');
    expect(paths).toContain('/_user/home');
    expect(paths).toContain('/_admin/home');
  });

  it('marks user and admin routes for client-side UX guards', () => {
    expect(
      appRoutes.find((route) => route.name === routeNames.userHome)?.meta?.requiresSession,
    ).toBe(true);
    expect(appRoutes.find((route) => route.name === routeNames.adminHome)?.meta).toMatchObject({
      requiresSession: true,
      requiresAdmin: true,
    });
  });

  it('provides a fallback route for unknown paths', () => {
    expect(appRoutes.some((route) => route.name === routeNames.notFound)).toBe(true);
  });
});
