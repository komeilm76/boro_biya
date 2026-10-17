import type { Router } from 'vue-router';
import { CLIENT_ROUTE_NAMESPACES } from '@boro-biya/contracts';

/** UX-only return navigation. API authorization remains mandatory at the destination. */
export function loginDestination(router: Router, requested: unknown, isAdmin: boolean): string {
  const fallback = isAdmin ? CLIENT_ROUTE_NAMESPACES.admin : CLIENT_ROUTE_NAMESPACES.user;
  if (
    typeof requested !== 'string' ||
    !requested.startsWith('/') ||
    requested.startsWith('//') ||
    /[\p{Cc}\s\\]/u.test(requested) ||
    /%(?![\da-f]{2})/i.test(requested)
  )
    return fallback;
  try {
    const target = router.resolve(requested);
    if (
      target.meta.requiresAuthentication !== true ||
      !['user', 'admin'].includes(target.meta.namespace) ||
      (target.meta.requiresAdminRole === true && !isAdmin) ||
      target.matched.some((record) => record.redirect !== undefined)
    )
      return fallback;
    return target.fullPath;
  } catch {
    return fallback;
  }
}
