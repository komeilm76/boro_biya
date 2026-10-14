import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { appRoutes, routeNames } from './routes.js';
import { createAccessGuard } from './guards.js';

async function resolvePath(
  path: string,
  access: { authenticated: boolean; administrator: boolean },
) {
  const router = createRouter({ history: createMemoryHistory(), routes: appRoutes });
  router.beforeEach(createAccessGuard(() => access));
  await router.push(path);
  return router.currentRoute.value;
}

describe('client route guard', () => {
  it('allows the public home route for guests', async () => {
    const route = await resolvePath('/_public/home', {
      authenticated: false,
      administrator: false,
    });
    expect(route.name).toBe(routeNames.home);
  });

  it('redirects a guest away from user routes with a return path', async () => {
    const route = await resolvePath('/_user/settings', {
      authenticated: false,
      administrator: false,
    });
    expect(route.name).toBe(routeNames.login);
    expect(route.query.returnTo).toBe('/_user/settings');
  });

  it('does not treat a signed-in non-admin as an administrator', async () => {
    const route = await resolvePath('/_admin/home', { authenticated: true, administrator: false });
    expect(route.name).toBe(routeNames.notFound);
  });

  it('allows the admin shell only when the supplied UX state permits it', async () => {
    const route = await resolvePath('/_admin/home', { authenticated: true, administrator: true });
    expect(route.name).toBe(routeNames.adminHome);
  });
});
