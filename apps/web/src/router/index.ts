import { CLIENT_ROUTE_NAMESPACES, type ClientRouteNamespace } from '@boro-biya/contracts';
import { createRouter, createWebHistory, type RouteRecordRaw, type Router, type RouterHistory } from 'vue-router';

/**
 * Client route namespaces (UI-01 … UI-04). The namespaces are reserved for client routes and
 * never collide with API paths; health and metrics stay infrastructure paths, never client
 * routes (OPS-64). Pages inside a namespace arrive with the phase that owns the feature — the
 * skeleton proves the namespaces, the guard behaviour, and the safe not-found page (UI-07).
 */
declare module 'vue-router' {
  interface RouteMeta {
    /** Which reserved namespace the route lives in, or the catch-all not-found route. */
    namespace: ClientRouteNamespace | 'notFound';
    /** UX-only gate: unauthenticated visitors are redirected to the sign-in entry (UI-05/06). */
    requiresAuthentication?: boolean;
    /** UX-only gate: the server remains the only authority for the role (ADM-02, Phase 2). */
    requiresAdminRole?: boolean;
    /**
     * Auth-namespace routes an authenticated user may still reach (logout confirmation, session
     * expiry, recovery entry — UI-05). Those screens arrive in Phase 2 with authentication.
     */
    reachableWhenAuthenticated?: boolean;
  }
}

export const ROUTE_NAMES = {
  publicLanding: 'public-landing',
  signIn: 'auth-sign-in',
  userArea: 'user-area',
  adminArea: 'admin-area',
  notFound: 'not-found',
} as const;

export const routes: RouteRecordRaw[] = [
  {
    path: '/_auth/setup',
    name: 'auth-setup',
    component: () => import('../pages/AuthSetup.vue'),
    meta: { namespace: 'auth' },
  },
  {
    path: '/_auth/recover',
    name: 'auth-recover',
    component: () => import('../pages/AuthRecover.vue'),
    meta: { namespace: 'auth', reachableWhenAuthenticated: true },
  },
  {
    path: '/_public/privacy',
    name: 'privacy',
    component: () => import('../pages/PrivacyNotice.vue'),
    meta: { namespace: 'public' },
  },
  {
    path: '/_public/report',
    name: 'report',
    component: () => import('../pages/ReportConcern.vue'),
    meta: { namespace: 'public' },
  },
  {
    path: '/_auth/register',
    name: 'auth-register',
    component: () => import('../pages/AuthRegister.vue'),
    meta: { namespace: 'auth' },
  },
  {
    path: '/',
    redirect: CLIENT_ROUTE_NAMESPACES.public,
  },
  {
    path: CLIENT_ROUTE_NAMESPACES.public,
    name: ROUTE_NAMES.publicLanding,
    component: () => import('../pages/PublicLanding.vue'),
    meta: { namespace: 'public' },
  },
  {
    path: `${CLIENT_ROUTE_NAMESPACES.auth}/login`,
    name: ROUTE_NAMES.signIn,
    component: () => import('../pages/SignInPlaceholder.vue'),
    meta: { namespace: 'auth' },
  },
  {
    path: CLIENT_ROUTE_NAMESPACES.user,
    name: ROUTE_NAMES.userArea,
    component: () => import('../pages/UserArea.vue'),
    meta: { namespace: 'user', requiresAuthentication: true },
  },
  {
    path: CLIENT_ROUTE_NAMESPACES.admin,
    name: ROUTE_NAMES.adminArea,
    component: () => import('../pages/AdminArea.vue'),
    meta: { namespace: 'admin', requiresAuthentication: true, requiresAdminRole: true },
  },
  {
    path: '/:pathMatch(.*)*',
    name: ROUTE_NAMES.notFound,
    component: () => import('../pages/NotFound.vue'),
    meta: { namespace: 'notFound' },
  },
];

export function createAppRouter(history?: RouterHistory): Router {
  return createRouter({
    history: history ?? createWebHistory(),
    routes,
  });
}
