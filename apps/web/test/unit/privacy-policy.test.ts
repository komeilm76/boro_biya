import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import { createPinia } from 'pinia';
import { createAppRouter } from '../../src/router/index.js';
import { createAppI18n } from '../../src/i18n/index.js';
import { authClient } from '../../src/auth-client.js';
import Privacy from '../../src/pages/PrivacyNotice.vue';
import { privacyPolicySchema } from '@boro-biya/validation';
const policy = {
  status: 'development_unapproved' as const,
  securityStreamTicketTtlSeconds: 15 as const,
  securityStreamMaxSeconds: 60 as const,
  automaticAccountDeletion: false as const,
  automatedDeletionRequested: false,
  challengeCleanupEnabled: false,
  challengeCleanupGraceSeconds: 300 as const,
  auditDaysCandidate: 365,
  operationalDaysCandidate: 30,
  recordRetentionEnforced: false as const,
  accessTtlSeconds: 120,
  refreshTtlSeconds: 604800,
  loginWindowSeconds: 600,
  recoveryEnabled: true,
  recoveryChallengeTtlSeconds: 120,
  recoveryGrantTtlSeconds: 180,
  captchaEnabled: true,
  captchaTtlSeconds: 300,
};
beforeEach(() => {
  vi.spyOn(authClient, 'privacyPolicy').mockResolvedValue(policy);
});
afterEach(() => {
  vi.restoreAllMocks();
});
function page(locale: 'en' | 'fa') {
  return mount(Privacy, {
    global: { plugins: [createPinia(), createAppRouter(createMemoryHistory()), createAppI18n(locale)] },
  });
}
describe('effective development privacy notice', () => {
  it.each(['en', 'fa'] as const)('allows enlarged privacy prose to wrap in %s', (locale) => {
    const wrapper = page(locale);
    expect(wrapper.get('section').classes()).toContain('wrap-anywhere');
    wrapper.unmount();
  });
  it.each(['en', 'fa'] as const)(
    'shows actual nondefault windows and localized policy distinctions in %s',
    async (locale) => {
      const wrapper = page(locale);
      await flushPromises();
      const text = wrapper.get('[data-policy="effective"]').text();
      const number = new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-GB');
      for (const value of [120, 604800, 600, 365, 30, 180, 300, 15, 60]) expect(text).toContain(number.format(value));
      expect(text).not.toContain('privacy.');
      expect(wrapper.find('a[href="/_public/report"]').exists()).toBe(true);
      expect(authClient.privacyPolicy).toHaveBeenCalledTimes(1);
      wrapper.unmount();
    },
  );
  it.each(['en', 'fa'] as const)(
    'distinguishes requested opt-in challenge cleanup from general enforcement in %s',
    async (locale) => {
      vi.mocked(authClient.privacyPolicy).mockResolvedValue({
        ...policy,
        automatedDeletionRequested: true,
        challengeCleanupEnabled: true,
      });
      const wrapper = page(locale);
      await flushPromises();
      expect(wrapper.get('[data-policy="effective"]').text()).toContain(
        new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-GB').format(300),
      );
      if (locale === 'en') {
        expect(wrapper.text()).toContain('only implemented deletion scope');
        expect(wrapper.text()).toContain('Neither value currently causes');
      }
      wrapper.unmount();
    },
  );
  it('does not substitute stale hard-coded defaults when policy loading fails', async () => {
    vi.mocked(authClient.privacyPolicy).mockRejectedValue(new Error('offline'));
    const wrapper = page('en');
    await flushPromises();
    expect(wrapper.find('[data-policy="effective"]').exists()).toBe(false);
    expect(wrapper.get('[role="alert"]').text()).toContain('could not be loaded');
    expect(wrapper.text()).not.toContain('15-minute');
    expect(wrapper.text()).not.toContain('30-day');
    wrapper.unmount();
  });
  it('does not imply recovery availability when it is disabled', async () => {
    vi.mocked(authClient.privacyPolicy).mockResolvedValue({
      ...policy,
      recoveryEnabled: false,
      captchaEnabled: false,
      captchaTtlSeconds: null,
    });
    const wrapper = page('en');
    await flushPromises();
    expect(wrapper.text()).toContain('Self-service recovery is unavailable');
    expect(wrapper.text()).not.toContain('Configured recovery lifetimes');
    wrapper.unmount();
  });
  it('validates the response contract and rejects unknown fields and enforcement claims', () => {
    expect(privacyPolicySchema.parse(policy)).toEqual(policy);
    for (const value of [
      { ...policy, secret: 'not public' },
      { ...policy, recordRetentionEnforced: true },
      { ...policy, automaticAccountDeletion: true },
      { ...policy, accessTtlSeconds: 901 },
    ])
      expect(privacyPolicySchema.safeParse(value).success).toBe(false);
  });
});
