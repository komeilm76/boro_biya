import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import { createAppRouter } from '../../src/router/index.js';
import { createAppI18n } from '../../src/i18n/index.js';
import { useSessionStore } from '../../src/stores/session.js';
import { authClient } from '../../src/auth-client.js';
import Register from '../../src/pages/AuthRegister.vue';
import Setup from '../../src/pages/AuthSetup.vue';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const mounted: Array<{ unmount(): void }> = [];
beforeEach(() => {
  vi.spyOn(authClient, 'recoveryPolicy').mockResolvedValue({ recoveryEnabled: true, passwordMinLength: 12 });
  vi.spyOn(authClient, 'csrf').mockResolvedValue({ csrfToken: 'C'.repeat(43) });
  vi.spyOn(authClient, 'register').mockResolvedValue(true);
  vi.spyOn(authClient, 'setupStart').mockResolvedValue(true);
  vi.spyOn(authClient, 'setupPassword').mockResolvedValue(true);
  vi.spyOn(authClient, 'setupSecurity').mockResolvedValue(true);
  vi.spyOn(authClient, 'setupStatus').mockResolvedValue({ passwordSetupRequired: true, securitySetupRequired: true });
});
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  vi.restoreAllMocks();
});
const flows = [
  { component: Register, name: 'registration', prefix: 'register', method: 'register' },
  { component: Setup, name: 'setup', prefix: 'setup', method: 'setupStart' },
] as const;
function page(flow: (typeof flows)[number], locale: 'en' | 'fa') {
  const pinia = createPinia();
  const session = useSessionStore(pinia);
  const wrapper = mount(flow.component, {
    global: {
      plugins: [pinia, createAppRouter(createMemoryHistory()), createAppI18n(locale)],
      stubs: { 'v-btn': { template: '<button><slot /></button>' } },
    },
  });
  mounted.push(wrapper);
  const replace = () => session.replaceSession({ isAuthenticated: true, roles: ['user'], accessToken: 'new-token' });
  return { wrapper, session, replace };
}
async function fill(wrapper: ReturnType<typeof page>['wrapper'], prefix: 'register' | 'setup') {
  await flushPromises();
  await wrapper.get(`#${prefix}-${prefix === 'register' ? 'user' : 'username'}`).setValue('invented_user');
  await wrapper.get(`#${prefix}-password`).setValue('Invented!password782');
  if (prefix === 'register') {
    await wrapper.get('#register-repeat').setValue('Invented!password782');
    for (const input of wrapper.findAll('input[id^="answer-"]')) await input.setValue('invented answer');
  }
}
describe.each(['en', 'fa'] as const)('enrolment lifecycle in %s', (locale) => {
  describe.each(flows)('$name', (flow) => {
    it.each(['unmount', 'identity'] as const)('does not send credentials after pending CSRF and %s', async (mode) => {
      const csrf = deferred<{ csrfToken: string }>();
      vi.mocked(authClient.csrf).mockReturnValueOnce(csrf.promise);
      const { wrapper, replace } = page(flow, locale);
      await fill(wrapper, flow.prefix);
      await wrapper.get('form').trigger('submit');
      expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined();
      if (mode === 'unmount') wrapper.unmount();
      else replace();
      csrf.resolve({ csrfToken: 'C'.repeat(43) });
      await flushPromises();
      expect(authClient[flow.method]).not.toHaveBeenCalled();
    });
    it.each(['success', 'failure'] as const)('ignores late %s after identity replacement', async (outcome) => {
      const pending = deferred<true>();
      vi.mocked(authClient[flow.method]).mockReturnValueOnce(pending.promise);
      const { wrapper, session, replace } = page(flow, locale);
      await fill(wrapper, flow.prefix);
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      expect(authClient[flow.method]).toHaveBeenCalledTimes(1);
      replace();
      await flushPromises();
      expect(wrapper.get(`#${flow.prefix}-password`).element).toHaveProperty('value', '');
      await wrapper.get(`#${flow.prefix}-password`).setValue('New!privatePassword782');
      if (outcome === 'success') pending.resolve(true);
      else pending.reject(new Error('invented failure'));
      await flushPromises();
      expect(wrapper.get(`#${flow.prefix}-password`).element).toHaveProperty('value', 'New!privatePassword782');
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(wrapper.find('form').exists()).toBe(true);
      expect(session.accessToken).toBe('new-token');
    });
    it('does not let a stale finally unlock a newer pending request', async () => {
      const old = deferred<true>();
      const next = deferred<true>();
      vi.mocked(authClient[flow.method]).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
      const { wrapper, replace } = page(flow, locale);
      await fill(wrapper, flow.prefix);
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      replace();
      await fill(wrapper, flow.prefix);
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      old.resolve(true);
      await flushPromises();
      expect(wrapper.get('form').attributes('aria-busy')).toBe('true');
      expect(wrapper.get(`#${flow.prefix}-password`).element).toHaveProperty('value', 'Invented!password782');
      next.resolve(true);
      await flushPromises();
      expect(wrapper.find(`#${flow.prefix}-password`).exists()).toBe(false);
    });
  });
  describe.each(['password', 'questions'] as const)('setup %s stage', (stage) => {
    async function ready() {
      const context = page(flows[1], locale);
      await fill(context.wrapper, 'setup');
      await context.wrapper.get('form').trigger('submit');
      await flushPromises();
      await context.wrapper.get('#setup-new-password').setValue('Invented!password782');
      await context.wrapper.get('#setup-repeat-password').setValue('Invented!password782');
      if (stage === 'questions') {
        await context.wrapper.get('form').trigger('submit');
        await flushPromises();
        for (const input of context.wrapper.findAll('input')) await input.setValue('invented answer');
      }
      return context;
    }
    it.each(['unmount', 'identity'] as const)(
      'does not send obsolete stage credentials after CSRF and %s',
      async (mode) => {
        const context = await ready();
        const method = stage === 'password' ? 'setupPassword' : 'setupSecurity';
        vi.mocked(authClient[method]).mockClear();
        const csrf = deferred<{ csrfToken: string }>();
        vi.mocked(authClient.csrf).mockReturnValueOnce(csrf.promise);
        await context.wrapper.get('form').trigger('submit');
        if (mode === 'unmount') context.wrapper.unmount();
        else context.replace();
        csrf.resolve({ csrfToken: 'C'.repeat(43) });
        await flushPromises();
        expect(authClient[method]).not.toHaveBeenCalled();
      },
    );
    it.each(['success', 'failure'] as const)(
      'does not advance or overwrite a replacement flow on late %s',
      async (outcome) => {
        const { wrapper, replace } = await ready();
        const pending = deferred<true>();
        vi.mocked(authClient[stage === 'password' ? 'setupPassword' : 'setupSecurity']).mockReturnValueOnce(
          pending.promise,
        );
        await wrapper.get('form').trigger('submit');
        await flushPromises();
        replace();
        await flushPromises();
        await wrapper.get('#setup-password').setValue('New!privatePassword782');
        if (outcome === 'success') pending.resolve(true);
        else pending.reject(new Error('invented failure'));
        await flushPromises();
        expect(wrapper.get('#setup-password').element).toHaveProperty('value', 'New!privatePassword782');
        expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      },
    );
  });
  it.each(['success', 'failure'] as const)('ignores late setup resume %s after an identity change', async (outcome) => {
    const pending = deferred<{ passwordSetupRequired: boolean; securitySetupRequired: boolean }>();
    vi.mocked(authClient.setupStatus).mockReturnValueOnce(pending.promise);
    const { wrapper, replace } = page(flows[1], locale);
    await flushPromises();
    await wrapper.get('button[type="button"]').trigger('click');
    replace();
    await flushPromises();
    await wrapper.get('#setup-password').setValue('New!privatePassword782');
    if (outcome === 'success') pending.resolve({ passwordSetupRequired: false, securitySetupRequired: true });
    else pending.reject(new Error('invented failure'));
    await flushPromises();
    expect(wrapper.get('#setup-password').element).toHaveProperty('value', 'New!privatePassword782');
    expect(wrapper.find('select').exists()).toBe(false);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
});
