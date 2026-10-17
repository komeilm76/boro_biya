import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import { createAppI18n, savedLocale } from '../../src/i18n/index.js';
import { createAppRouter } from '../../src/router/index.js';
import { authClient, authRequest, AuthRequestError, acceptedResponse, emptyResponse } from '../../src/auth-client.js';
import { useSessionStore } from '../../src/stores/session.js';
import RecoveryWarning from '../../src/components/RecoveryWarning.vue';
import SecurityAnswersForm from '../../src/components/SecurityAnswersForm.vue';
import Recover from '../../src/pages/AuthRecover.vue';
import SignIn from '../../src/pages/SignInPlaceholder.vue';
import Register from '../../src/pages/AuthRegister.vue';
import UserArea from '../../src/pages/UserArea.vue';
import LanguageSwitcher from '../../src/components/LanguageSwitcher.vue';
import PrivacyNotice from '../../src/pages/PrivacyNotice.vue';
import ReportConcern from '../../src/pages/ReportConcern.vue';

const userId = '01902c60-0000-7000-8000-000000000001';
const familyId = '01902c60-0000-7000-8000-000000000002';
const account = {
  id: userId,
  username: 'Alice',
  status: 'active',
  passwordSetupRequired: false,
  securitySetupRequired: false,
};
const fetcher = vi.fn<typeof fetch>();
beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal('fetch', fetcher);
  fetcher.mockReset();
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function response(body: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
function mountPage(component: Parameters<typeof mount>[0], language: 'en' | 'fa' = 'en', recoveryEnabled = true) {
  if (component === SignIn || component === Register)
    vi.spyOn(authClient, 'recoveryPolicy').mockResolvedValue({ recoveryEnabled, passwordMinLength: 12 });
  const router = createAppRouter(createMemoryHistory());
  const wrapper = mount(component, {
    global: {
      plugins: [createPinia(), router, createAppI18n(language)],
      stubs: { 'v-btn': { template: '<button><slot /></button>' } },
    },
  });
  return { wrapper, router, session: useSessionStore() };
}
function loginResponses() {
  fetcher
    .mockResolvedValueOnce(response({ csrfToken: 'A'.repeat(43) }))
    .mockResolvedValueOnce(response({ accessToken: 'signed', expiresIn: 900 }))
    .mockResolvedValueOnce(response(account));
}

describe('browser authentication transport and memory-only state', () => {
  it('exposes only bounded retry metadata for rate denials, never server prose', async () => {
    for (const [status, header, expected] of [
      [429, '30', 30],
      [429, '9999', undefined],
      [429, 'not-a-number', undefined],
      [401, '30', undefined],
    ] as const) {
      fetcher.mockResolvedValueOnce(
        new Response('private server detail', { status, headers: { 'retry-after': header } }),
      );
      const error: unknown = await authClient.me('signed').catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(AuthRequestError);
      expect(error).toMatchObject({ status, retryAfterSeconds: expected });
      expect(error instanceof Error && error.message).toBe('auth_request_rejected');
    }
  });
  it('validates responses, uses same-origin credentials and never permits an arbitrary endpoint', async () => {
    fetcher.mockResolvedValueOnce(response({ csrfToken: 'A'.repeat(43) }));
    expect((await authClient.csrf()).csrfToken).toHaveLength(43);
    expect(fetcher.mock.calls[0]?.[1]?.credentials).toBe('same-origin');
    await expect(authRequest('https://evil.test', emptyResponse)).rejects.toThrow('invalid API path');
    fetcher.mockResolvedValueOnce(response({}, 401));
    await expect(authClient.me('signed')).rejects.toThrow('auth_request_rejected');
    fetcher.mockResolvedValueOnce(response({}, 204));
    expect(
      await authRequest('/api/v1/auth/logout', emptyResponse, { method: 'POST', token: 'signed', csrf: 'csrf' }),
    ).toBeNull();
    expect(() => acceptedResponse.parse({ accepted: false })).toThrow();
    expect(() => acceptedResponse.parse(null)).toThrow();
    expect(() => emptyResponse.parse({})).toThrow();
  });
  it('keeps access in declared reactive Pinia state, restores with refresh and clears after failure/logout', async () => {
    const store = useSessionStore();
    loginResponses();
    await store.login('Alice', 'password');
    expect(store.isAuthenticated).toBe(true);
    expect(store.accessToken).toBe('signed');
    expect(localStorage.length).toBe(0);
    expect(JSON.stringify(fetcher.mock.calls[1]?.[1])).toContain('password');
    loginResponses();
    await store.restore();
    expect(store.username).toBe('Alice');
    fetcher.mockResolvedValueOnce(response({ csrfToken: 'A'.repeat(43) })).mockResolvedValueOnce(response({}, 204));
    await store.logout();
    expect(store.accessToken).toBe('');
    expect(store.isAuthenticated).toBe(false);
    fetcher.mockRejectedValueOnce(new Error('offline'));
    await store.restore();
    expect(store.isAuthenticated).toBe(false);
    store.$patch({ accessToken: 'old', isAuthenticated: true });
    fetcher.mockRejectedValueOnce(new Error('offline'));
    await expect(store.logout()).rejects.toThrow();
    expect(store.accessToken).toBe('');
  });
});

describe('bilingual authentication, settings and public privacy UI', () => {
  it('submits login, clears password, navigates only after validated account response and displays generic failure', async () => {
    const { wrapper, router } = mountPage(SignIn);
    loginResponses();
    await wrapper.get('#username').setValue('Alice');
    await wrapper.get('#password').setValue('password');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect((wrapper.get('#password').element as HTMLInputElement).value).toBe('');
    expect(router.currentRoute.value.path).toBe('/_user');
    fetcher.mockRejectedValueOnce(new Error('offline'));
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  });
  it('collects five distinct question selections, submits registration and clears every secret', async () => {
    const { wrapper } = mountPage(Register);
    fetcher
      .mockResolvedValueOnce(response({ csrfToken: 'A'.repeat(43) }))
      .mockResolvedValueOnce(response({ accepted: true }));
    await wrapper.get('#register-user').setValue('Alice');
    await wrapper.get('#register-password').setValue('password');
    await wrapper.get('#register-repeat').setValue('password');
    for (let i = 0; i < 5; i++) await wrapper.get(`#answer-${i}`).setValue(`answer${i}`);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('[role="status"]').text()).toContain('Account created');
    const rawBody = fetcher.mock.calls[1]?.[1]?.body;
    if (typeof rawBody !== 'string') throw new Error('expected JSON body');
    const body = JSON.parse(rawBody) as { answers: unknown[]; locale: string };
    expect(body.locale).toBe('en');
    expect(body.answers).toHaveLength(5);
    const failed = mountPage(Register, 'fa');
    fetcher.mockRejectedValueOnce(new Error('offline'));
    await failed.wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(failed.wrapper.find('[role="alert"]').exists()).toBe(true);
  });
  it('shows a localized login retry notice without replaying credentials and clears the password', async () => {
    const { wrapper, session } = mountPage(SignIn, 'fa');
    fetcher
      .mockResolvedValueOnce(response({ csrfToken: 'A'.repeat(43) }))
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'retry-after': '30' } }));
    await wrapper.get('#username').setValue('alice');
    await wrapper.get('#password').setValue('secret');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('30');
    expect(wrapper.get('[role="alert"]').text()).toContain('ثانیه');
    expect((wrapper.get('#password').element as HTMLInputElement).value).toBe('');
    expect(session.isAuthenticated).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('lists sessions with localized dates and exercises revoke/refresh/logout safely', async () => {
    fetcher.mockResolvedValueOnce(
      response([
        {
          familyId,
          issuedAt: '2026-01-01T00:00:00Z',
          expiresAt: '2026-02-01T00:00:00Z',
          lastSeenAt: '2026-01-01T00:00:00Z',
        },
      ]),
    );
    const { wrapper, session } = mountPage(UserArea, 'fa');
    session.$patch({ accessToken: 'signed', csrf: 'csrf', isAuthenticated: true });
    await flushPromises();
    expect(wrapper.find('time').text()).not.toContain('2026-01-01T');
    fetcher.mockResolvedValueOnce(response({}, 204)).mockResolvedValueOnce(response([]));
    await wrapper.find('li button').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('li')).toHaveLength(0);
    fetcher.mockResolvedValueOnce(response({}, 204)).mockResolvedValueOnce(response([]));
    await wrapper.get('[data-action="revoke-others"]').trigger('click');
    await flushPromises();
    fetcher.mockRejectedValueOnce(new Error('offline'));
    await wrapper.get('[data-action="load"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    fetcher.mockResolvedValueOnce(response({ csrfToken: 'A'.repeat(43) })).mockResolvedValueOnce(response({}, 204));
    await wrapper.get('[data-action="logout"]').trigger('click');
    await flushPromises();
    expect(session.isAuthenticated).toBe(false);
  });
  it('submits a password change, clears credentials and requires a new sign-in', async () => {
    fetcher.mockResolvedValueOnce(response([]));
    const { wrapper, session, router } = mountPage(UserArea);
    session.$patch({ accessToken: 'signed', isAuthenticated: true });
    await flushPromises();
    await wrapper.get('#current-password').setValue('old secret');
    await wrapper.get('#new-password').setValue('new secret 123!');
    await wrapper.get('#new-password-repeat').setValue('new secret 123!');
    fetcher.mockResolvedValueOnce(response({ accepted: true }));
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(session.isAuthenticated).toBe(false);
    expect(router.currentRoute.value.path).toBe('/_auth/login');
    expect((wrapper.get('#current-password').element as HTMLInputElement).value).toBe('');
    fetcher.mockRejectedValueOnce(new Error('rejected'));
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  });
  it('switches before sign-in, persists only explicit locale and updates document direction', async () => {
    expect(savedLocale()).toBe('en');
    const { wrapper } = mountPage(LanguageSwitcher);
    await wrapper.findAll('button')[1]?.trigger('click');
    expect(localStorage.getItem('boro-locale')).toBe('fa');
    expect(savedLocale()).toBe('fa');
    expect(document.documentElement.dir).toBe('rtl');
    await wrapper.findAll('button')[0]?.trigger('click');
    expect(document.documentElement.lang).toBe('en');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
      throw new Error('blocked');
    });
    expect(savedLocale()).toBe('en');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('blocked');
    });
    await wrapper.findAll('button')[1]?.trigger('click');
  });
  it('restores the account language, saves explicit changes and preserves the prior choice on failure', async () => {
    const { wrapper, session } = mountPage(LanguageSwitcher);
    session.$patch({ isAuthenticated: true, accessToken: 'signed', preferredLocale: 'fa' });
    await flushPromises();
    expect(document.documentElement.dir).toBe('rtl');
    expect(localStorage.getItem('boro-locale')).toBe('fa');
    fetcher.mockResolvedValueOnce(response({ locale: 'en' }));
    await wrapper.findAll('button')[0]?.trigger('click');
    await flushPromises();
    expect(session.preferredLocale).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/v1/users/me/preferences');
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe('PUT');
    fetcher.mockRejectedValueOnce(new Error('offline'));
    await wrapper.findAll('button')[1]?.trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(localStorage.getItem('boro-locale')).toBe('en');
    expect(session.preferredLocale).toBe('en');
    session.clearSession();
    await wrapper.findAll('button')[1]?.trigger('click');
    await flushPromises();
    expect(localStorage.getItem('boro-locale')).toBe('fa');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('never applies a delayed preference response to a different signed-in identity', async () => {
    const store = useSessionStore();
    store.$patch({ isAuthenticated: true, accessToken: 'old', preferredLocale: 'en' });
    let finish: (value: Response) => void = () => {};
    fetcher.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = store.saveLocale('fa');
    store.$patch({ accessToken: 'new', preferredLocale: 'en' });
    finish(response({ locale: 'fa' }));
    expect(await pending).toBe(false);
    expect(store.preferredLocale).toBe('en');
    store.clearSession();
    await expect(store.saveLocale('fa')).rejects.toThrow('auth_request_rejected');
  });
  it('publishes bilingual privacy/reporting pages without an application session', () => {
    for (const locale of ['en', 'fa'] as const) {
      expect(mountPage(PrivacyNotice, locale).wrapper.find('h1').text().length).toBeGreaterThan(3);
      expect(mountPage(ReportConcern, locale).wrapper.find('a').attributes('href')).toContain(
        '/security/advisories/new',
      );
    }
  });
});

describe('recovery browser workflow', () => {
  it.each(['en', 'fa'] as const)(
    'renders security notices and localized dates in %s, clearing them on sign-out',
    async (language) => {
      fetcher.mockResolvedValueOnce(response([]));
      const { wrapper, session } = mountPage(UserArea, language);
      session.$patch({ securityNotices: [{ event: 'password_reset', createdAt: '2026-10-17T12:00:00.000Z' }] });
      await flushPromises();
      expect(wrapper.get('aside[role="status"]').text()).not.toContain('securityNotices.');
      expect(wrapper.get('time').attributes('datetime')).toBe('2026-10-17T12:00:00.000Z');
      session.clearSession();
      await flushPromises();
      expect(wrapper.find('aside').exists()).toBe(false);
    },
  );
  it.each(['en', 'fa'] as const)(
    'completes the three-stage cookie-bound flow in %s without storing proofs',
    async (language) => {
      fetcher.mockImplementation(async (input) => {
        await Promise.resolve();
        const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (path.endsWith('/policy')) return response({ recoveryEnabled: true, passwordMinLength: 12 });
        if (path.endsWith('/csrf')) return response({ csrfToken: 'C'.repeat(43) });
        if (path.endsWith('/questions'))
          return response(
            [1, 2, 3].map((id) => ({
              id,
              textKey: `questions.${['firstBook', 'childhoodGame', 'favoriteTeacher'][id - 1]}`,
            })),
          );
        return response({ accepted: true });
      });
      const { wrapper, session } = mountPage(Recover, language);
      await flushPromises();
      await wrapper.get('#recovery-username').setValue('alice');
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      expect(wrapper.findAll('input[type="password"]')).toHaveLength(3);
      for (const field of wrapper.findAll('input')) await field.setValue('answer');
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      expect(wrapper.find('#recovery-password').exists()).toBe(true);
      await wrapper.get('#recovery-password').setValue('Sailing!violet782');
      await wrapper.get('#recovery-repeat').setValue('Sailing!violet782');
      session.$patch({ isAuthenticated: true, accessToken: 'old' });
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      expect(wrapper.find('form').exists()).toBe(false);
      expect(session.isAuthenticated).toBe(false);
      expect(localStorage.length).toBe(0);
      const calls = fetcher.mock.calls.filter(([url]) =>
        (typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).includes('/password/'),
      );
      expect(calls).toHaveLength(4);
      for (const [, options] of calls) {
        expect(options?.credentials).toBe('same-origin');
        expect(options?.method).toBe('POST');
      }
    },
  );
  it('fails closed on disabled or unavailable policy', async () => {
    fetcher.mockResolvedValueOnce(response({ recoveryEnabled: false, passwordMinLength: 12 }));
    const { wrapper } = mountPage(Recover);
    await flushPromises();
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.text()).toContain('Self-service recovery is unavailable');
    fetcher.mockRejectedValueOnce(new Error('offline'));
    const second = mountPage(Recover);
    await flushPromises();
    expect(second.wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(second.wrapper.find('form').exists()).toBe(false);
  });
  it('shows a generic failure and allows a clean restart without retaining answers', async () => {
    fetcher.mockImplementation(async (input) => {
      await Promise.resolve();
      if ((typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).endsWith('/policy'))
        return response({ recoveryEnabled: true, passwordMinLength: 12 });
      if ((typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).endsWith('/csrf'))
        return response({ csrfToken: 'C'.repeat(43) });
      if ((typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).endsWith('/questions'))
        return response(
          [1, 2, 3].map((id) => ({
            id,
            textKey: `questions.${['firstBook', 'childhoodGame', 'favoriteTeacher'][id - 1]}`,
          })),
        );
      if ((typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).endsWith('/verify'))
        return response({}, 401);
      return response({ accepted: true });
    });
    const { wrapper } = mountPage(Recover);
    await flushPromises();
    await wrapper.get('#recovery-username').setValue('alice');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Recovery could not be completed');
    await wrapper.get('button[type="button"]').trigger('click');
    expect(wrapper.find('#recovery-username').exists()).toBe(true);
    expect(wrapper.findAll('input[type="password"]')).toHaveLength(0);
  });
});

describe('recovery policy warnings and security-answer settings', () => {
  it.each(['en', 'fa'] as const)('shows switch-off warnings on login and registration in %s', async (language) => {
    for (const page of [SignIn, Register]) {
      const { wrapper } = mountPage(page, language, false);
      await flushPromises();
      const warning = wrapper.get('aside[role="note"]');
      expect(warning.get('[role="status"]').text()).not.toContain('recovery.disabled');
      if (language === 'en') expect(warning.text()).toContain('only administrator-assisted recovery');
    }
  });
  it('warns while policy is pending before credentials can be relied on', async () => {
    vi.spyOn(authClient, 'recoveryPolicy').mockImplementation(() => new Promise(() => {}));
    const { wrapper } = mountPage(RecoveryWarning);
    expect(wrapper.get('[role="status"]').text()).toContain('only administrator-assisted recovery');
    await flushPromises();
    expect(wrapper.find('[role="status"]').exists()).toBe(true);
  });
  it('warns rather than promising recovery when policy cannot be loaded', async () => {
    vi.spyOn(authClient, 'recoveryPolicy').mockRejectedValue(new Error('offline'));
    const { wrapper } = mountPage(RecoveryWarning);
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toContain('Self-service recovery is unavailable');
  });
  it.each(['en', 'fa'] as const)(
    'submits five new answers in %s and clears secrets on success/failure',
    async (language) => {
      const { wrapper, session, router } = mountPage(SecurityAnswersForm, language);
      session.$patch({ isAuthenticated: true, accessToken: 'signed' });
      await wrapper.get('#answers-current-password').setValue('current password');
      for (const field of wrapper.findAll('input[autocomplete="off"]')) await field.setValue('new answer');
      fetcher.mockResolvedValueOnce(response({ accepted: true }));
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      const body = fetcher.mock.calls[0]?.[1]?.body;
      if (typeof body !== 'string') throw new Error('expected JSON');
      expect(JSON.parse(body)).toEqual({
        currentPassword: 'current password',
        answers: [1, 2, 3, 4, 5].map((questionId) => ({ questionId, answer: 'new answer' })),
      });
      expect(wrapper.findAll('select')).toHaveLength(5);
      expect(session.isAuthenticated).toBe(false);
      expect(router.currentRoute.value.path).toBe('/_auth/login');
      for (const field of wrapper.findAll('input')) expect((field.element as HTMLInputElement).value).toBe('');
      fetcher.mockRejectedValueOnce(new Error('offline'));
      await wrapper.get('#answers-current-password').setValue('secret');
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      expect(wrapper.find('[role="alert"]').exists()).toBe(true);
      expect((wrapper.get('#answers-current-password').element as HTMLInputElement).value).toBe('');
      expect(localStorage.length).toBe(0);
    },
  );
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
describe('identity-bound browser authentication races', () => {
  it.each(['success', 'failure'] as const)(
    'ignores a late restore %s after a new identity replaces the session',
    async (outcome) => {
      const store = useSessionStore();
      const pending = deferred<Response>();
      fetcher
        .mockResolvedValueOnce(response({ csrfToken: 'A'.repeat(43) }))
        .mockResolvedValueOnce(response({ accessToken: 'old', expiresIn: 900 }))
        .mockReturnValueOnce(pending.promise);
      const restoring = store.restore();
      await flushPromises();
      store.replaceSession({
        isAuthenticated: true,
        roles: ['custom'],
        permissions: ['users.read'],
        accessToken: 'new',
        username: 'new identity',
      });
      if (outcome === 'success') pending.resolve(response(account));
      else pending.reject(new Error('offline'));
      await restoring;
      expect(store.username).toBe('new identity');
      expect(store.accessToken).toBe('new');
      expect(store.isAdmin).toBe(true);
    },
  );
  it('does not resurrect a pending sign-in after logout, and serializes cookie cleanup', async () => {
    const store = useSessionStore(),
      pending = deferred<Response>();
    fetcher
      .mockResolvedValueOnce(response({ csrfToken: 'A'.repeat(43) }))
      .mockResolvedValueOnce(response({ accessToken: 'old', expiresIn: 900 }))
      .mockReturnValueOnce(pending.promise);
    const signingIn = store.login('Alice', 'secret').catch((error: unknown) => error);
    await flushPromises();
    fetcher.mockResolvedValueOnce(response({ csrfToken: 'B'.repeat(43) })).mockResolvedValueOnce(response({}, 204));
    const signingOut = store.logout();
    await flushPromises();
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(store.isAuthenticated).toBe(false);
    pending.resolve(response(account));
    expect(await signingIn).toBeInstanceOf(Error);
    await signingOut;
    expect(store.isAuthenticated).toBe(false);
    expect(store.accessToken).toBe('');
    expect(fetcher.mock.calls[4]?.[0]).toBe('/api/v1/auth/logout');
  });
  it('does not let a late logout erase a newer sign-in or run its cookie mutation out of order', async () => {
    const store = useSessionStore(),
      pending = deferred<Response>();
    store.replaceSession({ isAuthenticated: true, roles: [], accessToken: 'old' });
    fetcher.mockResolvedValueOnce(response({ csrfToken: 'A'.repeat(43) })).mockReturnValueOnce(pending.promise);
    const signingOut = store.logout();
    await flushPromises();
    loginResponses();
    const signingIn = store.login('Alice', 'secret');
    await flushPromises();
    expect(fetcher).toHaveBeenCalledTimes(2);
    pending.resolve(response({}, 204));
    await signingOut;
    await signingIn;
    expect(store.isAuthenticated).toBe(true);
    expect(store.username).toBe('Alice');
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it('cancels sign-in before credential submission when its pending CSRF response becomes stale', async () => {
    const store = useSessionStore(),
      pending = deferred<Response>();
    fetcher.mockReturnValueOnce(pending.promise);
    const signingIn = store.login('Alice', 'secret').catch((error: unknown) => error);
    await flushPromises();
    store.clearSession();
    pending.resolve(response({ csrfToken: 'A'.repeat(43) }));
    expect(await signingIn).toBeInstanceOf(Error);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('replaces all prior identity fields and copies effective permissions instead of retaining credentials', () => {
    const store = useSessionStore();
    store.replaceSession({
      isAuthenticated: true,
      roles: ['admin'],
      accessToken: 'old',
      username: 'old',
      csrf: 'old',
      userId,
      permissions: ['users.read'],
      preferredLocale: 'fa',
      securityNotices: [{ event: 'password_reset', createdAt: '2026-10-17T00:00:00Z' }],
    });
    const version = store.authVersion!;
    store.replaceSession({ isAuthenticated: true, roles: ['admin'] });
    expect(store.accessToken).toBe('');
    expect(store.csrf).toBe('');
    expect(store.username).toBe('');
    expect(store.userId).toBe('');
    expect(store.securityNotices).toEqual([]);
    expect(store.preferredLocale).toBe('en');
    expect(store.isAdmin).toBe(false);
    expect(store.authVersion).toBeGreaterThan(version);
  });
});

it('does not apply a pending locale change across identity replacement even if a token fixture is reused', async () => {
  const store = useSessionStore(),
    pending = deferred<Response>();
  store.replaceSession({ isAuthenticated: true, roles: [], accessToken: 'same', preferredLocale: 'en' });
  fetcher.mockReturnValueOnce(pending.promise);
  const saving = store.saveLocale('fa');
  store.replaceSession({ isAuthenticated: true, roles: [], accessToken: 'same', preferredLocale: 'en' });
  pending.resolve(response({ locale: 'fa' }));
  expect(await saving).toBe(false);
  expect(store.preferredLocale).toBe('en');
});
