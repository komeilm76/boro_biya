import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createAppI18n } from '../../src/i18n/index.js';
import { authClient, AuthRequestError } from '../../src/auth-client.js';
import Report from '../../src/pages/ReportConcern.vue';
const message = 'Synthetic report with no personal data.';
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.spyOn(authClient, 'csrf').mockResolvedValue({ csrfToken: 'A'.repeat(43) });
  vi.spyOn(authClient, 'reportSecurity').mockResolvedValue(true);
});
afterEach(() => vi.restoreAllMocks());
function page(locale: 'en' | 'fa' = 'en') {
  return mount(Report, { global: { plugins: [createAppI18n(locale)] } });
}
describe('signed-out operator reporting', () => {
  it.each(['en', 'fa'] as const)('bounds native report controls at enlarged text sizes in %s', (locale) => {
    const wrapper = page(locale);
    expect(wrapper.get('section').classes()).toContain('wrap-anywhere');
    for (const selector of ['select', 'textarea'])
      for (const utility of ['w-full', 'min-w-0', 'max-w-full']) {
        expect(wrapper.get(selector).classes()).toContain(utility);
      }
    expect(wrapper.get('label[for="report-category"]').text()).not.toBe('');
    wrapper.unmount();
  });
  it.each(['en', 'fa'] as const)(
    'submits without any session store in %s and clears private draft after receipt',
    async (locale) => {
      const wrapper = page(locale);
      await wrapper.get('textarea').setValue(message);
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      expect(authClient.reportSecurity).toHaveBeenCalledWith(
        { category: 'account_compromise', message, locale },
        'A'.repeat(43),
      );
      expect(wrapper.get('[role="status"]').text()).toBe(createAppI18n(locale).global.t('report.accepted'));
      expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('');
      expect(wrapper.text()).not.toContain(message);
      wrapper.unmount();
    },
  );
  it('blocks invalid input without requesting CSRF or sending content', async () => {
    const wrapper = page();
    await wrapper.get('textarea').setValue('short');
    await wrapper.get('form').trigger('submit');
    expect(authClient.csrf).not.toHaveBeenCalled();
    expect(authClient.reportSecurity).not.toHaveBeenCalled();
    expect(wrapper.get('[role="alert"]').text()).toContain('20–4,000');
    wrapper.unmount();
  });
  it.each([new AuthRequestError(429), new Error('network')])(
    'keeps uncertain drafts and does not automatically replay failed submissions',
    async (error) => {
      vi.mocked(authClient.reportSecurity).mockRejectedValue(error);
      const wrapper = page();
      await wrapper.get('textarea').setValue(message);
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      expect(wrapper.find('[role="status"]').exists()).toBe(false);
      expect(wrapper.get('[role="alert"]').text()).not.toContain('report.');
      expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(message);
      expect(authClient.reportSecurity).toHaveBeenCalledTimes(1);
      wrapper.unmount();
    },
  );
  it('suppresses duplicate submission while CSRF is pending and does not send after unmount', async () => {
    const pending = deferred<{ csrfToken: string }>();
    vi.mocked(authClient.csrf).mockReturnValue(pending.promise);
    const wrapper = page();
    await wrapper.get('textarea').setValue(message);
    await wrapper.get('form').trigger('submit');
    await wrapper.get('form').trigger('submit');
    expect(authClient.csrf).toHaveBeenCalledTimes(1);
    wrapper.unmount();
    pending.resolve({ csrfToken: 'A'.repeat(43) });
    await flushPromises();
    expect(authClient.reportSecurity).not.toHaveBeenCalled();
  });
});
