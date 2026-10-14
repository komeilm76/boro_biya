import type { RouteRecordRaw } from 'vue-router';
import AdminHomeView from '../views/admin/AdminHomeView.vue';
import LoginView from '../views/auth/LoginView.vue';
import HelpView from '../views/public/HelpView.vue';
import HomeView from '../views/public/HomeView.vue';
import NotFoundView from '../views/public/NotFoundView.vue';
import UserHomeView from '../views/user/UserHomeView.vue';
import UserSettingsView from '../views/user/UserSettingsView.vue';

declare module 'vue-router' {
  interface RouteMeta {
    requiresSession?: boolean;
    requiresAdmin?: boolean;
  }
}

/** Stable route names used by navigation and access guards. */
export const routeNames = {
  home: 'home',
  help: 'help',
  login: 'login',
  userHome: 'user-home',
  userSettings: 'user-settings',
  adminHome: 'admin-home',
  notFound: 'not-found',
} as const;

/** Client-side route namespaces; they are UX boundaries, not server authorization. */
export const appRoutes: RouteRecordRaw[] = [
  { path: '/', redirect: { name: routeNames.home } },
  { path: '/_public/home', name: routeNames.home, component: HomeView },
  { path: '/_public/help', name: routeNames.help, component: HelpView },
  { path: '/_auth/login', name: routeNames.login, component: LoginView },
  {
    path: '/_user/home',
    name: routeNames.userHome,
    component: UserHomeView,
    meta: { requiresSession: true },
  },
  {
    path: '/_user/settings',
    name: routeNames.userSettings,
    component: UserSettingsView,
    meta: { requiresSession: true },
  },
  {
    path: '/_admin/home',
    name: routeNames.adminHome,
    component: AdminHomeView,
    meta: { requiresSession: true, requiresAdmin: true },
  },
  { path: '/:pathMatch(.*)*', name: routeNames.notFound, component: NotFoundView },
];
