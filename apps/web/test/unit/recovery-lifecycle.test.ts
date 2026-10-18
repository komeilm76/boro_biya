import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import { createAppRouter } from '../../src/router/index.js';
import { createAppI18n } from '../../src/i18n/index.js';
import { useSessionStore } from '../../src/stores/session.js';
import { authClient } from '../../src/auth-client.js';
import Recover from '../../src/pages/AuthRecover.vue';
import SecurityAnswers from '../../src/components/SecurityAnswersForm.vue';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const questions = [1, 2, 3].map((id) => ({
  id,
  textKey: `questions.${['firstBook', 'childhoodGame', 'favoriteTeacher'][id - 1]}`,
}));
const mounted: Array<{ unmount(): void }> = [];
beforeEach(() => {
  vi.spyOn(authClient, 'recoveryPolicy').mockResolvedValue({ recoveryEnabled: true, passwordMinLength: 12 });
  vi.spyOn(authClient, 'csrf').mockResolvedValue({ csrfToken: 'C'.repeat(43) });
  vi.spyOn(authClient, 'forgot').mockResolvedValue(true);
  vi.spyOn(authClient, 'recoveryQuestions').mockResolvedValue(questions);
  vi.spyOn(authClient, 'verifyRecovery').mockResolvedValue(true);
  vi.spyOn(authClient, 'resetPassword').mockResolvedValue(true);
  vi.spyOn(authClient, 'changeSecurityAnswers').mockResolvedValue(true);
});
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  vi.restoreAllMocks();
});
function page(component: Parameters<typeof mount>[0], locale: 'en' | 'fa') {
  const pinia = createPinia(),
    session = useSessionStore(pinia),
    router = createAppRouter(createMemoryHistory());
  const wrapper = mount(component, { global: { plugins: [pinia, router, createAppI18n(locale)] } });
  mounted.push(wrapper);
  const replace = () =>
    session.replaceSession({
      isAuthenticated: true,
      roles: ['user'],
      accessToken: 'same-token',
      userId: '01902c60-0000-7000-8000-000000000002',
    });
  return { wrapper, session, router, replace };
}
async function resetForm(wrapper: ReturnType<typeof page>['wrapper']) {
  await flushPromises();
  await wrapper.get('#recovery-username').setValue('invented_user');
  await wrapper.get('form').trigger('submit');
  await flushPromises();
  for (const input of wrapper.findAll('input[type="password"]')) await input.setValue('invented answer');
  await wrapper.get('form').trigger('submit');
  await flushPromises();
  await wrapper.get('#recovery-password').setValue('Invented!password782');
  await wrapper.get('#recovery-repeat').setValue('Invented!password782');
}

describe.each(['en', 'fa'] as const)('recovery and answer-change lifecycle in %s', (locale) => {
  it.each(['unmount', 'identity'] as const)('does not send recovery credentials after pending CSRF and %s', (mode) => {
    return (async () => {
      const csrf = deferred<{ csrfToken: string }>();
      vi.mocked(authClient.csrf).mockReturnValueOnce(csrf.promise);
      const { wrapper, replace } = page(Recover, locale);
      await flushPromises();
      await wrapper.get('#recovery-username').setValue('invented_user');
      await wrapper.get('form').trigger('submit');
      if (mode === 'unmount') wrapper.unmount();
      else replace();
      csrf.resolve({ csrfToken: 'C'.repeat(43) });
      await flushPromises();
      expect(authClient.forgot).not.toHaveBeenCalled();
      expect(authClient.recoveryQuestions).not.toHaveBeenCalled();
    })();
  });
  it('does not fetch recovery questions after the old entry request completes on a departed page', async () => {
    const entry = deferred<true>();
    vi.mocked(authClient.forgot).mockReturnValueOnce(entry.promise);
    const { wrapper } = page(Recover, locale);
    await flushPromises();
    await wrapper.get('#recovery-username').setValue('invented_user');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    wrapper.unmount();
    entry.resolve(true);
    await flushPromises();
    expect(authClient.recoveryQuestions).not.toHaveBeenCalled();
  });
  it.each(['success', 'failure'] as const)(
    'ignores a late reset %s after a new identity replaces the flow',
    async (outcome) => {
      const pending = deferred<true>();
      vi.mocked(authClient.resetPassword).mockReturnValueOnce(pending.promise);
      const { wrapper, session, replace } = page(Recover, locale);
      await resetForm(wrapper);
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      expect(authClient.resetPassword).toHaveBeenCalledTimes(1);
      replace();
      await flushPromises();
      expect(wrapper.find('#recovery-username').exists()).toBe(true);
      await wrapper.get('#recovery-username').setValue('another_invented_user');
      if (outcome === 'success') pending.resolve(true);
      else pending.reject(new Error('invented failure'));
      await flushPromises();
      expect(session.isAuthenticated).toBe(true);
      expect(session.accessToken).toBe('same-token');
      expect(wrapper.get('#recovery-username').element).toHaveProperty('value', 'another_invented_user');
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    },
  );
  it('does not clear a later session when a reset succeeds after unmount', async () => {
    const pending = deferred<true>();
    vi.mocked(authClient.resetPassword).mockReturnValueOnce(pending.promise);
    const { wrapper, session, replace } = page(Recover, locale);
    await resetForm(wrapper);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    wrapper.unmount();
    replace();
    pending.resolve(true);
    await flushPromises();
    expect(session.isAuthenticated).toBe(true);
    expect(session.accessToken).toBe('same-token');
  });
  it('allows the same 64-character username entry as registration and login', async () => {
    const { wrapper } = page(Recover, locale);
    await flushPromises();
    expect(wrapper.get('#recovery-username').attributes('maxlength')).toBe('64');
    const username = 'a'.repeat(64);
    await wrapper.get('#recovery-username').setValue(username);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(authClient.forgot).toHaveBeenCalledWith(username, 'C'.repeat(43), undefined);
  });
  it.each(['success', 'failure'] as const)(
    'ignores old security-answer %s, clears secrets, and preserves newer identity',
    async (outcome) => {
      const pending = deferred<true>();
      vi.mocked(authClient.changeSecurityAnswers).mockReturnValueOnce(pending.promise);
      const { wrapper, session, router, replace } = page(SecurityAnswers, locale);
      session.replaceSession({
        isAuthenticated: true,
        roles: ['user'],
        accessToken: 'same-token',
        userId: '01902c60-0000-7000-8000-000000000001',
      });
      await flushPromises();
      await wrapper.get('#answers-current-password').setValue('invented current password');
      for (const input of wrapper.findAll('input[autocomplete="off"]')) await input.setValue('invented answer');
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      const push = vi.spyOn(router, 'push');
      replace();
      await flushPromises();
      for (const input of wrapper.findAll('input')) expect(input.element).toHaveProperty('value', '');
      await wrapper.get('#answers-current-password').setValue('new identity draft');
      if (outcome === 'success') pending.resolve(true);
      else pending.reject(new Error('invented failure'));
      await flushPromises();
      expect(session.isAuthenticated).toBe(true);
      expect(session.accessToken).toBe('same-token');
      expect(push).not.toHaveBeenCalled();
      expect(wrapper.get('#answers-current-password').element).toHaveProperty('value', 'new identity draft');
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    },
  );
});
