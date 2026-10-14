import type { NavigationGuard } from 'vue-router';
import { routeNames } from './routes.js';

/** Minimal state supplied to the UX-only route guard. */
export interface RouteAccessState {
  authenticated: boolean;
  administrator: boolean;
}

/**
 * Creates a client guard that hides protected route shells from signed-out visitors.
 * Server authorization remains authoritative; Phase 1 has no authentication implementation.
 */
export function createAccessGuard(readAccess: () => RouteAccessState): NavigationGuard {
  return (to) => {
    const state = readAccess();
    if (to.meta.requiresSession && !state.authenticated) {
      return {
        name: routeNames.login,
        query: { returnTo: to.fullPath },
      };
    }
    if (to.meta.requiresAdmin && !state.administrator) {
      return { name: routeNames.notFound };
    }
    return true;
  };
}
