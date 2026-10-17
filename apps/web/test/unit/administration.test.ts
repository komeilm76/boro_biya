import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import { createAppRouter } from '../../src/router/index.js';
import { createAppI18n } from '../../src/i18n/index.js';
import { useSessionStore } from '../../src/stores/session.js';
import AdminManagement from '../../src/components/AdminManagement.vue';
import { administrativePermissionKeys } from '@boro-biya/validation';
const fetcher = vi.fn<typeof fetch>();
const userId = '01902c60-0000-7000-8000-000000000001';
const roleId = '01902c60-0000-7000-8000-000000000002';
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}
const user = {
  id: userId,
  username: 'target',
  status: 'active',
  passwordSetupRequired: false,
  securitySetupRequired: false,
  reason: null,
  stateChangedAt: '2026-10-17T12:00:00.000Z',
};
beforeEach(() => {
  vi.stubGlobal('fetch', fetcher);
  fetcher.mockReset();
  localStorage.clear();
  fetcher.mockImplementation((input, options) => {
    const path = typeof input === 'string' ? input : '';
    if (options?.method === 'PATCH' || options?.method === 'POST')
      return Promise.resolve(
        response(
          path.includes('/roles') && !path.includes('/users/') ? { id: roleId } : { accepted: true },
          path === '/api/v1/admin/roles' && options.method === 'POST' ? 201 : 200,
        ),
      );
    if (path.includes('audit-events')) return Promise.resolve(response({ items: [], nextCursor: null }));
    if (path.includes('/roles'))
      return Promise.resolve(
        response({
          items: [{ id: roleId, key: 'custom', nameKey: 'roles.custom', permissions: ['users.read'] }],
          permissions: [...administrativePermissionKeys],
          nextCursor: null,
        }),
      );
    if (path.includes('/users/me'))
      return Promise.resolve(
        response({
          id: userId,
          username: 'operator',
          status: 'active',
          passwordSetupRequired: false,
          securitySetupRequired: false,
          roles: ['admin'],
          permissions: [...administrativePermissionKeys],
        }),
      );
    return Promise.resolve(response({ items: [user], nextCursor: null }));
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function page(locale: 'en' | 'fa') {
  const pinia = createPinia();
  const session = useSessionStore(pinia);
  session.$patch({
    isAuthenticated: true,
    accessToken: 'signed',
    username: 'operator',
    userId: roleId,
    roles: ['admin'],
    permissions: [...administrativePermissionKeys],
  });
  const wrapper = mount(AdminManagement, {
    global: { plugins: [pinia, createAppRouter(createMemoryHistory()), createAppI18n(locale)] },
  });
  await flushPromises();
  return { wrapper, session };
}
describe('bilingual administrative lifecycle controls', () => {
  it.each(['en', 'fa'] as const)(
    'submits an explicit state transition in %s and clears current-password input',
    async (locale) => {
      const { wrapper } = await page(locale);
      expect(wrapper.text()).toContain('target');
      await wrapper.get('#managed-user').setValue(userId);
      await wrapper.get('#managed-action').setValue('ban');
      await wrapper.get('#managed-reason').setValue('reviewed reason');
      await wrapper.get('#management-password').setValue('private password');
      await wrapper.findAll('form')[0]!.trigger('submit');
      await flushPromises();
      const mutation = fetcher.mock.calls.find(
        ([path, options]) => typeof path === 'string' && path.endsWith('/ban') && options?.method === 'POST',
      );
      const rawBody = mutation?.[1]?.body;
      if (typeof rawBody !== 'string') throw new Error('expected JSON body');
      expect(JSON.parse(rawBody)).toEqual({
        reason: 'reviewed reason',
        currentPassword: 'private password',
      });
      expect((wrapper.get('#management-password').element as HTMLInputElement).value).toBe('');
      expect(wrapper.find('[role="status"]').exists()).toBe(true);
      expect(localStorage.length).toBe(0);
    },
  );
  it.each(['en', 'fa'] as const)('submits role assignment and custom-role permissions in %s', async (locale) => {
    const { wrapper } = await page(locale);
    await wrapper.get('#managed-user').setValue(userId);
    await wrapper.get('#managed-role-ids').setValue([roleId]);
    await wrapper.get('#management-password').setValue('private password');
    await wrapper.findAll('form')[1]!.trigger('submit');
    await flushPromises();
    expect(
      fetcher.mock.calls.some(
        ([path, options]) =>
          typeof path === 'string' && path.includes(`/users/${userId}/roles`) && options?.method === 'PATCH',
      ),
    ).toBe(true);
    await wrapper.get('#managed-key').setValue('new_role');
    await wrapper.get('#managed-name').setValue('roles.new_role');
    await wrapper.get('#managed-permissions').setValue(['users.read']);
    await wrapper.get('#management-password').setValue('private password');
    await wrapper.findAll('form')[2]!.trigger('submit');
    await flushPromises();
    expect(
      fetcher.mock.calls.some(([path, options]) => path === '/api/v1/admin/roles' && options?.method === 'POST'),
    ).toBe(true);
  });
  it('keeps generic errors and clears reauthentication input after denials', async () => {
    const { wrapper } = await page('en');
    await wrapper.get('#management-password').setValue('private password');
    fetcher.mockRejectedValueOnce(new Error('private SQL error'));
    await wrapper.findAll('form')[0]!.trigger('submit');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).not.toContain('SQL');
    expect((wrapper.get('#management-password').element as HTMLInputElement).value).toBe('');
  });
  it('uses current effective permissions for custom-role UX, not just the seeded admin name', async () => {
    const { session, wrapper } = await page('en');
    session.$patch({ roles: ['custom'], permissions: ['users.read'] });
    await flushPromises();
    expect(session.isAdmin).toBe(true);
    expect(wrapper.findAll('form')[0]!.get('fieldset').attributes('disabled')).toBeDefined();
    session.$patch({ permissions: [] });
    expect(session.isAdmin).toBe(false);
  });
});

it('clears the current local session when an allowed self-state transition revokes it', async () => {
  const { wrapper, session } = await page('en');
  session.$patch({ userId });
  await wrapper.get('#managed-user').setValue(userId);
  await wrapper.get('#managed-action').setValue('deactivate');
  await wrapper.get('#managed-reason').setValue('requested by owner');
  await wrapper.get('#management-password').setValue('private password');
  await wrapper.findAll('form')[0]!.trigger('submit');
  await flushPromises();
  expect(session.isAuthenticated).toBe(false);
  expect(session.permissions).toEqual([]);
});

it.each(['en', 'fa'] as const)(
  'displays a reissued credential once in %s and clears it on identity change',
  async (locale) => {
    const { wrapper, session } = await page(locale);
    await wrapper.get('#managed-user').setValue(userId);
    await wrapper.get('#reissue-reason').setValue('lost setup proof');
    await wrapper.get('#management-password').setValue('private password');
    fetcher.mockResolvedValueOnce(
      response({
        id: userId,
        username: 'target',
        expiresAt: '2026-10-18T12:00:00Z',
        setupCredential: 'display-once-secret',
      }),
    );
    await wrapper.findAll('form')[3]!.trigger('submit');
    await flushPromises();
    expect(wrapper.get('output').text()).toContain('display-once-secret');
    expect((wrapper.get('#management-password').element as HTMLInputElement).value).toBe('');
    expect(localStorage.length).toBe(0);
    session.clearSession();
    await flushPromises();
    expect(wrapper.find('output').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('target');
  },
);
it.each(['read', 'mutation', 'profile'] as const)(
  'discards a stale administrative %s response from another identity',
  async (phase) => {
    const { wrapper, session } = await page('en');
    let resolve!: (value: Response) => void;
    const pending = new Promise<Response>((yes) => {
      resolve = yes;
    });
    if (phase === 'read') {
      fetcher.mockReturnValueOnce(pending);
      await wrapper.findAll('button')[0]!.trigger('click');
    } else {
      await wrapper.get('#managed-user').setValue(userId);
      await wrapper.get('#managed-reason').setValue('review');
      if (phase === 'profile') fetcher.mockResolvedValueOnce(response({ accepted: true }));
      fetcher.mockReturnValueOnce(pending);
      await wrapper.findAll('form')[0]!.trigger('submit');
      await flushPromises();
    }
    session.replaceSession({
      isAuthenticated: true,
      roles: [],
      permissions: [],
      accessToken: 'new',
      username: 'new identity',
      userId,
    });
    resolve(
      response(
        phase === 'read'
          ? { items: [user], nextCursor: null }
          : phase === 'mutation'
            ? { accepted: true }
            : {
                id: userId,
                username: 'operator',
                status: 'active',
                passwordSetupRequired: false,
                securitySetupRequired: false,
                roles: ['admin'],
                permissions: [...administrativePermissionKeys],
              },
      ),
    );
    await flushPromises();
    expect(session.username).toBe('new identity');
    expect(session.accessToken).toBe('new');
    expect(session.permissions).toEqual([]);
    expect(wrapper.text()).not.toContain('target');
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  },
);
it('clears role and audit data immediately when permissions are removed', async () => {
  const { wrapper, session } = await page('en');
  expect(wrapper.text()).toContain('custom');
  session.$patch({ permissions: [] });
  await flushPromises();
  expect(wrapper.text()).not.toContain('custom');
  expect(wrapper.text()).not.toContain('target');
});

it.each(['en', 'fa'] as const)(
  'applies user/audit filters in %s and clears them on identity change',
  async (locale) => {
    const { wrapper, session } = await page(locale);
    await wrapper.get('#search-username').setValue('ＴＡＲＧＥＴ');
    await wrapper.get('#search-status').setValue('active');
    await wrapper.get('#search-setup').setValue('false');
    await wrapper.get('#search-role').setValue(roleId);
    await wrapper.get('[data-action="search-users"]').trigger('click');
    await flushPromises();
    const call = fetcher.mock.calls.findLast(([path]) => typeof path === 'string' && path.includes('/admin/users?'))!;
    const query = new URL(call[0] as string, 'https://example.test').searchParams;
    expect(query.get('username')).toBe('target');
    expect(query.get('status')).toBe('active');
    expect(query.get('setupRequired')).toBe('false');
    expect(query.get('roleId')).toBe(roleId);
    expect(query.has('cursor')).toBe(false);
    await wrapper.get('#search-actor').setValue(userId);
    await wrapper.get('#search-audit-action').setValue('account_ban');
    await wrapper.get('#search-from').setValue('2026-10-17T00:00:00Z');
    await wrapper.get('#search-to').setValue('2026-10-18T00:00:00Z');
    await wrapper.get('[data-action="search-audit"]').trigger('click');
    await flushPromises();
    expect(
      fetcher.mock.calls.some(
        ([path]) =>
          typeof path === 'string' && path.includes('action=account_ban') && path.includes(`actorId=${userId}`),
      ),
    ).toBe(true);
    expect(localStorage.length).toBe(0);
    session.clearSession();
    await flushPromises();
    expect((wrapper.get('#search-username').element as HTMLInputElement).value).toBe('');
    expect((wrapper.get('#search-actor').element as HTMLInputElement).value).toBe('');
  },
);
it('rejects invalid audit filters without sending a request', async () => {
  const { wrapper } = await page('en');
  const calls = fetcher.mock.calls.length;
  await wrapper.get('#search-from').setValue('2026-02-30T00:00:00Z');
  await wrapper.get('[data-action="search-audit"]').trigger('click');
  await flushPromises();
  expect(fetcher).toHaveBeenCalledTimes(calls);
  expect(wrapper.find('[role="alert"]').exists()).toBe(true);
});
it('discards a pending result when a newer filter is applied', async () => {
  const { wrapper } = await page('en');
  let resolve!: (value: Response) => void;
  fetcher.mockReturnValueOnce(
    new Promise<Response>((yes) => {
      resolve = yes;
    }),
  );
  await wrapper.get('#search-username').setValue('old');
  await wrapper.get('[data-action="search-users"]').trigger('click');
  fetcher.mockResolvedValueOnce(response({ items: [], nextCursor: null }));
  await wrapper.get('#search-username').setValue('new');
  await wrapper.get('[data-action="search-users"]').trigger('click');
  await flushPromises();
  resolve(response({ items: [user], nextCursor: null }));
  await flushPromises();
  expect(wrapper.text()).not.toContain('target');
});

it('keeps applied filters rather than unsubmitted drafts when advancing user/audit pages', async () => {
  const { wrapper } = await page('en');
  fetcher.mockResolvedValueOnce(response({ items: [user], nextCursor: userId }));
  await wrapper.get('#search-username').setValue('target');
  await wrapper.get('[data-action="search-users"]').trigger('click');
  await flushPromises();
  await wrapper.get('#search-username').setValue('unsubmitted');
  fetcher.mockResolvedValueOnce(response({ items: [], nextCursor: null }));
  await wrapper.get('[data-action="next-users"]').trigger('click');
  await flushPromises();
  const users = fetcher.mock.calls.findLast(([path]) => typeof path === 'string' && path.includes('/admin/users?'))!;
  expect(new URL(users[0] as string, 'https://example.test').searchParams.get('username')).toBe('target');
  expect(new URL(users[0] as string, 'https://example.test').searchParams.get('cursor')).toBe(userId);
  fetcher.mockResolvedValueOnce(response({ items: [], nextCursor: userId }));
  await wrapper.get('#search-audit-action').setValue('account_ban');
  await wrapper.get('[data-action="search-audit"]').trigger('click');
  await flushPromises();
  await wrapper.get('#search-audit-action').setValue('unsubmitted');
  fetcher.mockResolvedValueOnce(response({ items: [], nextCursor: null }));
  await wrapper.get('[data-action="next-audit"]').trigger('click');
  await flushPromises();
  const audits = fetcher.mock.calls.findLast(
    ([path]) => typeof path === 'string' && path.includes('/admin/audit-events?'),
  )!;
  expect(new URL(audits[0] as string, 'https://example.test').searchParams.get('action')).toBe('account_ban');
  expect(new URL(audits[0] as string, 'https://example.test').searchParams.get('cursor')).toBe(userId);
});
