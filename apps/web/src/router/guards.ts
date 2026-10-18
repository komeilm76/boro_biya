import { CLIENT_ROUTE_NAMESPACES } from '@boro-biya/contracts';
import type { Router } from 'vue-router';
import { useSessionStore } from '../stores/session.js';

/**
 * Route guards are user experience only (UI-06, ADR-012): they hide navigation a visitor
 * cannot use and keep URLs tidy. They never replace server-side authorization — every route
 * that displays protected data revalidates access through the API on load, and the API rejects
 * unauthorized requests regardless of what the client rendered.
 */
export function installRouteGuards(router: Router): void {
  router.beforeEach((to) => {
    const session = useSessionStore();

    // UI-05 (first half): routes that require a session send unauthenticated visitors to the
    // sign-in entry, preserving the private destination for validated post-login return navigation.
    if (to.meta.requiresAuthentication === true && !session.isAuthenticated) {
      return {
        path: `${CLIENT_ROUTE_NAMESPACES.auth}/login`,
        query: { redirect: to.fullPath },
      };
    }

    // The admin namespace is additionally gated on current administrative permissions for UX; the server remains
    // the only authority (ADM-02 arrives with authentication in Phase 2).
    if (to.meta.requiresAdminRole === true && !session.isAdmin) {
      return { path: CLIENT_ROUTE_NAMESPACES.user };
    }

    // UI-05 (second half): signed-in users are redirected away from sign-in pages. Routes an
    // authenticated user may still reach (logout confirmation, session expiry, recovery entry)
    // opt in through `reachableWhenAuthenticated` when Phase 2 adds them.
    if (to.meta.namespace === 'auth' && session.isAuthenticated && to.meta.reachableWhenAuthenticated !== true) {
      return { path: session.isAdmin ? CLIENT_ROUTE_NAMESPACES.admin : CLIENT_ROUTE_NAMESPACES.user };
    }

    return true;
  });
}
