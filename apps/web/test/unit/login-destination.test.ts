import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { createAppRouter } from '../../src/router/index.js';
import { loginDestination } from '../../src/router/login-destination.js';

describe('post-login private navigation', () => {
  const router = createAppRouter(createMemoryHistory());
  it.each([
    undefined,
    null,
    [],
    ['/_user'],
    1,
    '',
    'https://example.invalid',
    '//example.invalid',
    '/\\example.invalid',
    'javascript:alert(1)',
    '/_auth/login',
    '/_auth/recover',
    '/_public/privacy',
    '/missing',
    '/_user/../_public',
    '/_user\n',
    '/_user?bad=%',
    '/_user#%zz',
  ])('fails closed on unsafe or non-private destinations: %j', (value) => {
    expect(loginDestination(router, value, false)).toBe('/_user');
    expect(loginDestination(router, value, true)).toBe('/_admin');
  });
  it('preserves only resolved private locations with their query and hash', () => {
    expect(loginDestination(router, '/_user?tab=sessions#security', false)).toBe('/_user?tab=sessions#security');
    expect(loginDestination(router, '/_user?search=a%20b', true)).toBe('/_user?search=a%20b');
    expect(loginDestination(router, '/_admin?tab=roles#users', true)).toBe('/_admin?tab=roles#users');
    expect(loginDestination(router, '/_admin?tab=roles', false)).toBe('/_user');
  });
  it('refuses redirecting route records and resolution failures', () => {
    router.addRoute({
      path: '/_private-alias',
      redirect: '/_public',
      meta: { namespace: 'user', requiresAuthentication: true },
    });
    expect(loginDestination(router, '/_private-alias', false)).toBe('/_user');
    vi.spyOn(router, 'resolve').mockImplementationOnce(() => {
      throw new Error('unresolvable');
    });
    expect(loginDestination(router, '/_user', false)).toBe('/_user');
    vi.restoreAllMocks();
  });
});
