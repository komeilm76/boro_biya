import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import { createAppRouter } from '../../src/router/index.js';
import { createAppI18n } from '../../src/i18n/index.js';
import { useSessionStore } from '../../src/stores/session.js';
import { authClient } from '../../src/auth-client.js';
import UserArea from '../../src/pages/UserArea.vue';
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const item = (familyId: string) => ({
  familyId,
  issuedAt: '2026-01-01T00:00:00Z',
  expiresAt: '2026-02-01T00:00:00Z',
  lastSeenAt: '2026-01-01T00:00:00Z',
});
const oldId = '01902c60-0000-7000-8000-000000000001',
  newId = '01902c60-0000-7000-8000-000000000002';
const fetcher = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal('fetch', fetcher);
  fetcher.mockReset();
  vi.spyOn(authClient, 'recoveryPolicy').mockResolvedValue({ recoveryEnabled: true, passwordMinLength: 12 });
  vi.spyOn(authClient, 'sessions').mockResolvedValue([]);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function page() {
  const pinia = createPinia(),
    session = useSessionStore(pinia),
    router = createAppRouter(createMemoryHistory());
  session.replaceSession({ isAuthenticated: true, roles: ['user'], accessToken: 'same-token', userId: oldId });
  const wrapper = mount(UserArea, {
    global: {
      plugins: [pinia, router, createAppI18n()],
      stubs: { 'v-btn': { template: '<button><slot /></button>' } },
    },
  });
  const replace = () =>
    session.replaceSession({ isAuthenticated: true, roles: ['user'], accessToken: 'same-token', userId: newId });
  return { wrapper, session, router, replace };
}
async function password(wrapper: ReturnType<typeof page>['wrapper']) {
  await wrapper.get('#current-password').setValue('old private password');
  await wrapper.get('#new-password').setValue('New!synthetic782');
  await wrapper.get('#new-password-repeat').setValue('New!synthetic782');
  await wrapper.get('form').trigger('submit');
  await flushPromises();
}
describe('session settings asynchronous privacy boundaries', () => {
  it('does not restore an old session list after a newer refresh', async () => {
    const old = deferred<ReturnType<typeof item>[]>();
    vi.mocked(authClient.sessions)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce([item(newId)]);
    const { wrapper } = page();
    await wrapper.get('[data-action="load"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('li')).toHaveLength(1);
    old.resolve([]);
    await flushPromises();
    expect(wrapper.findAll('li')).toHaveLength(1);
    wrapper.unmount();
  });
  it('clears displayed session data and credentials when identity changes, including token reuse', async () => {
    vi.mocked(authClient.sessions).mockResolvedValueOnce([item(oldId)]);
    const { wrapper, replace } = page();
    await flushPromises();
    expect(wrapper.findAll('li')).toHaveLength(1);
    await wrapper.get('#current-password').setValue('private');
    replace();
    await flushPromises();
    expect(wrapper.findAll('li')).toHaveLength(0);
    expect((wrapper.get('#current-password').element as HTMLInputElement).value).toBe('');
    wrapper.unmount();
  });
  it.each(['resolve', 'reject'] as const)('discards a session read that becomes stale before %s', async (outcome) => {
    const pending = deferred<ReturnType<typeof item>[]>();
    vi.mocked(authClient.sessions).mockReturnValueOnce(pending.promise);
    const { wrapper, replace } = page();
    replace();
    if (outcome === 'resolve') pending.resolve([item(oldId)]);
    else pending.reject(new Error('old failure'));
    await flushPromises();
    expect(wrapper.findAll('li')).toHaveLength(0);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it.each(['identity', 'unmount'] as const)(
    'does not clear a new identity or redirect after a password change becomes stale through %s',
    async (reason) => {
      const pending = deferred<Response>();
      fetcher.mockReturnValueOnce(pending.promise);
      const { wrapper, session, router, replace } = page();
      await flushPromises();
      await password(wrapper);
      if (reason === 'unmount') wrapper.unmount();
      else replace();
      pending.resolve(new Response(JSON.stringify({ accepted: true }), { status: 200 }));
      await flushPromises();
      expect(session.isAuthenticated).toBe(true);
      expect(router.currentRoute.value.path).not.toBe('/_auth/login');
      if (reason !== 'unmount') wrapper.unmount();
    },
  );
  it('does not start a new-identity refresh after an old revocation completes', async () => {
    vi.mocked(authClient.sessions).mockResolvedValueOnce([item(oldId)]);
    const pending = deferred<Response>();
    fetcher.mockReturnValueOnce(pending.promise);
    const { wrapper, replace } = page();
    await flushPromises();
    await wrapper.get('li [data-action="revoke-session"]').trigger('click');
    replace();
    pending.resolve(new Response(null, { status: 204 }));
    await flushPromises();
    expect(authClient.sessions).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
  it.each(['resolve', 'reject'] as const)(
    'does not redirect or show an old logout error after a new identity signs in (%s)',
    async (outcome) => {
      const { wrapper, session, router, replace } = page();
      const pending = deferred<void>();
      vi.spyOn(session, 'logout').mockImplementation(() => {
        session.clearSession();
        return pending.promise;
      });
      await router.push('/_user');
      await flushPromises();
      await wrapper.get('[data-action="logout"]').trigger('click');
      replace();
      if (outcome === 'resolve') pending.resolve();
      else pending.reject(new Error('old logout'));
      await flushPromises();
      expect(router.currentRoute.value.path).toBe('/_user');
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      wrapper.unmount();
    },
  );
});
