import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, type Router } from 'vue-router';
import { createAppRouter } from '../../src/router/index.js';
import { installRouteGuards } from '../../src/router/guards.js';
import { useSessionStore } from '../../src/stores/session.js';

let router: Router;

beforeEach(async () => {
  setActivePinia(createPinia());
  router = createAppRouter(createMemoryHistory());
  installRouteGuards(router);
  await router.push('/_public');
  await router.isReady();
});

describe('UX-only route guards (UI-05, UI-06)', () => {
  it('starts unauthenticated: the session seam has no way to sign in during Phase 1 (GOV-02)', () => {
    const session = useSessionStore();
    expect(session.isAuthenticated).toBe(false);
    expect(session.roles).toEqual([]);
    expect(session.isAdmin).toBe(false);
  });

  it('redirects unauthenticated visitors of /_user and /_admin to the sign-in entry, preserving the target', async () => {
    await router.push('/_user');
    expect(router.currentRoute.value.path).toBe('/_auth/login');
    expect(router.currentRoute.value.query['redirect']).toBe('/_user');

    await router.push('/_admin');
    expect(router.currentRoute.value.path).toBe('/_auth/login');
    expect(router.currentRoute.value.query['redirect']).toBe('/_admin');
  });

  it('lets the public namespace through for everyone', async () => {
    await router.push('/_public');
    expect(router.currentRoute.value.path).toBe('/_public');
  });

  it('redirects signed-in users away from sign-in pages (UI-05)', async () => {
    const session = useSessionStore();
    session.replaceSession({ isAuthenticated: true, roles: [] });
    await router.push('/_auth/login');
    expect(router.currentRoute.value.path).toBe('/_user');
  });

  it('sends signed-in admins to the admin area instead', async () => {
    const session = useSessionStore();
    session.replaceSession({ isAuthenticated: true, roles: ['admin'] });
    await router.push('/_auth/login');
    expect(router.currentRoute.value.path).toBe('/_admin');
  });

  it('gates the admin namespace on the admin role for UX only', async () => {
    const session = useSessionStore();
    session.replaceSession({ isAuthenticated: true, roles: [] });
    await router.push('/_admin');
    expect(router.currentRoute.value.path).toBe('/_user');

    session.replaceSession({ isAuthenticated: true, roles: ['admin'] });
    await router.push('/_admin');
    expect(router.currentRoute.value.path).toBe('/_admin');
  });

  it('lets authenticated users into their own area', async () => {
    const session = useSessionStore();
    session.replaceSession({ isAuthenticated: true, roles: [] });
    await router.push('/_user');
    expect(router.currentRoute.value.path).toBe('/_user');
  });

  it('clearing the session restores the unauthenticated behaviour', async () => {
    const session = useSessionStore();
    session.replaceSession({ isAuthenticated: true, roles: [] });
    await router.push('/_user');
    expect(router.currentRoute.value.path).toBe('/_user');
    session.clearSession();
    await router.push('/_public');
    await router.push('/_user');
    expect(router.currentRoute.value.path).toBe('/_auth/login');
  });
});
