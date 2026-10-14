import { createRouter, createWebHistory } from 'vue-router';
import { createAccessGuard } from './guards.js';
import { appRoutes } from './routes.js';

/** Application router; unauthenticated state is intentional until the account phase. */
export const router = createRouter({
  history: createWebHistory(),
  routes: appRoutes,
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach(createAccessGuard(() => ({ authenticated: false, administrator: false })));
