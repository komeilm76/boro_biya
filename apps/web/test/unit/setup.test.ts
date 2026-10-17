import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import { createAppRouter } from '../../src/router/index.js';
import { createAppI18n } from '../../src/i18n/index.js';
import { authClient } from '../../src/auth-client.js';
import { useSessionStore } from '../../src/stores/session.js';
import Setup from '../../src/pages/AuthSetup.vue';
import AdminCreate from '../../src/components/AdminCreateAccount.vue';
const fetcher = vi.fn<typeof fetch>();
const id = '01902c60-0000-7000-8000-000000000001';
beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal('fetch', fetcher);
  fetcher.mockReset();
  localStorage.clear();
  vi.spyOn(authClient, 'recoveryPolicy').mockResolvedValue({ recoveryEnabled: true, passwordMinLength: 12 });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}
function page(component: Parameters<typeof mount>[0], locale: 'en' | 'fa') {
  return mount(component, {
    global: { plugins: [createPinia(), createAppRouter(createMemoryHistory()), createAppI18n(locale)] },
  });
}
describe('first-login and account-creation browser flows', () => {
  it.each(['en', 'fa'] as const)(
    'performs ordered setup in %s without retaining temporary/new credentials',
    async (locale) => {
      fetcher.mockImplementation((input) =>
        Promise.resolve(
          response(
            (typeof input === 'string' ? input : '').endsWith('/csrf')
              ? { csrfToken: 'C'.repeat(43) }
              : { accepted: true },
          ),
        ),
      );
      const wrapper = page(Setup, locale);
      await flushPromises();
      await wrapper.get('#setup-username').setValue('created_user');
      await wrapper.get('#setup-password').setValue('temporary secret');
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      expect(wrapper.find('#setup-new-password').exists()).toBe(true);
      await wrapper.get('#setup-new-password').setValue('Fresh!orchard762');
      await wrapper.get('#setup-repeat-password').setValue('Fresh!orchard762');
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      expect(wrapper.findAll('select')).toHaveLength(5);
      for (const input of wrapper.findAll('input')) await input.setValue('new private answer');
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      expect(wrapper.find('form').exists()).toBe(false);
      expect(wrapper.get('[role="status"]').text()).not.toContain('setup.done');
      expect(localStorage.length).toBe(0);
      expect(useSessionStore().isAuthenticated).toBe(false);
      expect(fetcher.mock.calls.filter(([url]) => typeof url === 'string' && url.includes('/setup/'))).toHaveLength(3);
    },
  );
  it.each(['en', 'fa'] as const)(
    'displays a generated credential once in %s and clears input secrets',
    async (locale) => {
      fetcher.mockResolvedValueOnce(
        response(
          {
            id,
            username: 'created_user',
            expiresAt: '2026-10-18T12:00:00.000Z',
            setupCredential: 'one-time-secret',
          },
          201,
        ),
      );
      const wrapper = page(AdminCreate, locale);
      useSessionStore().$patch({ accessToken: 'signed', isAuthenticated: true });
      await wrapper.get('#created-username').setValue('created_user');
      await wrapper.get('#admin-current-password').setValue('current secret');
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      expect(wrapper.get('output').text()).toBe('one-time-secret');
      expect((wrapper.get('#admin-current-password').element as HTMLInputElement).value).toBe('');
      expect(fetcher.mock.calls[0]?.[1]?.body).not.toContain('temporaryPassword');
      await wrapper.get('[data-action="forget-credential"]').trigger('click');
      expect(wrapper.find('output').exists()).toBe(false);
      expect(localStorage.length).toBe(0);
    },
  );
  it('resumes a persisted setup stage and clears secrets after failures', async () => {
    fetcher.mockResolvedValueOnce(response({ passwordSetupRequired: false, securitySetupRequired: true }));
    const wrapper = page(Setup, 'en');
    await wrapper.get('button[type="button"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('select')).toHaveLength(5);
    for (const input of wrapper.findAll('input')) await input.setValue('private');
    fetcher.mockRejectedValueOnce(new Error('offline'));
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    for (const input of wrapper.findAll('input')) expect((input.element as HTMLInputElement).value).toBe('');
  });
  it('does not show stale generated credentials after another failed creation', async () => {
    fetcher.mockResolvedValueOnce(
      response(
        {
          id,
          username: 'created_user',
          expiresAt: '2026-10-18T12:00:00.000Z',
          setupCredential: 'one-time-secret',
        },
        201,
      ),
    );
    const wrapper = page(AdminCreate, 'en');
    await wrapper.get('#created-username').setValue('created_user');
    await wrapper.get('#admin-current-password').setValue('current password');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('output').exists()).toBe(true);
    fetcher.mockRejectedValueOnce(new Error('denied'));
    await wrapper.get('#created-temporary-password').setValue('temporary secret');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('output').exists()).toBe(false);
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect((wrapper.get('#created-temporary-password').element as HTMLInputElement).value).toBe('');
  });
});

it('loads current role keys for the UX guard and clears them when the profile changes', async () => {
  const store = useSessionStore();
  const account = {
    id,
    username: 'operator',
    status: 'active',
    passwordSetupRequired: false,
    securitySetupRequired: false,
    roles: ['admin'],
    permissions: ['users.read'],
  };
  fetcher
    .mockResolvedValueOnce(response({ csrfToken: 'C'.repeat(43) }))
    .mockResolvedValueOnce(response({ accessToken: 'signed', expiresIn: 900 }))
    .mockResolvedValueOnce(response(account));
  await store.login('operator', 'secret');
  expect(store.isAdmin).toBe(true);
  fetcher
    .mockResolvedValueOnce(response({ csrfToken: 'C'.repeat(43) }))
    .mockResolvedValueOnce(response({ accessToken: 'signed', expiresIn: 900 }))
    .mockResolvedValueOnce(response({ ...account, roles: ['user'], permissions: [] }));
  await store.restore();
  expect(store.isAdmin).toBe(false);
});

it('does not display a newly created account credential to a later identity', async () => {
  let resolve!: (value: Response) => void;
  fetcher.mockReturnValueOnce(
    new Promise<Response>((yes) => {
      resolve = yes;
    }),
  );
  const wrapper = page(AdminCreate, 'en');
  const store = useSessionStore();
  store.$patch({ isAuthenticated: true, accessToken: 'old' });
  await wrapper.get('form').trigger('submit');
  await flushPromises();
  store.replaceSession({ isAuthenticated: true, roles: [], accessToken: 'new' });
  resolve(
    response({
      id,
      username: 'previous-target',
      expiresAt: '2026-10-18T00:00:00Z',
      setupCredential: 'previous-secret',
    }),
  );
  await flushPromises();
  expect(wrapper.find('output').exists()).toBe(false);
  expect(wrapper.text()).not.toContain('previous-secret');
});
